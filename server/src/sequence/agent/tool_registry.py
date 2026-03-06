import inspect
import importlib
import pkgutil
import json
import types
import re
import logging
from typing import Any, Callable, Literal, Union, get_args, get_origin

logger = logging.getLogger(__name__)

_JSON_PRIMITIVES: dict[type, str] = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
}


def _annotation_to_schema(ann: Any) -> dict[str, Any]:
    if ann is inspect.Parameter.empty or ann is Any:
        return {"type": "string"}

    origin = get_origin(ann)
    args = get_args(ann)

    # Literal["a", "b"]
    if origin is Literal:
        values = list(args)
        non_null_vals = [v for v in values if v is not None]
        has_null = None in values or type(None) in values
        jtype = _JSON_PRIMITIVES.get(type(non_null_vals[0]), "string") if non_null_vals else "string"
        return {
            "type": [jtype, "null"] if has_null else jtype,
            "enum": values if has_null else non_null_vals,
        }

    # Union / X | Y (including str | None)
    if origin is Union or isinstance(ann, types.UnionType):
        non_null = [a for a in args if a is not type(None)]
        has_null = type(None) in args

        if len(non_null) == 1:
            base = _annotation_to_schema(non_null[0])
            if has_null:
                if isinstance(base.get("type"), str):
                    base["type"] = [base["type"], "null"]
                    if "enum" in base:
                        base["enum"] = base["enum"] + [None]
                elif isinstance(base.get("type"), list):
                    if "null" not in base["type"]:
                        base["type"].append("null")
                else:
                    base = {"anyOf": [base, {"type": "null"}]}
            return base

        variants = [_annotation_to_schema(a) for a in non_null]
        if has_null:
            variants.append({"type": "null"})
        return {"anyOf": variants}

    # list / list[T]
    if ann is list:
        return {"type": "array", "items": {"type": "string"}}
    if origin is list:
        return {"type": "array", "items": _annotation_to_schema(args[0] if args else Any)}

    # dict / dict[str, T]
    if ann is dict or origin is dict:
        return {"type": "object", "properties": {}, "additionalProperties": False}

    # tuple[T, ...]
    if origin is tuple:
        if len(args) == 2 and args[1] is Ellipsis:
            return {"type": "array", "items": _annotation_to_schema(args[0])}
        if args:
            return {"type": "array", "items": {"anyOf": [_annotation_to_schema(a) for a in args]}}
        return {"type": "array", "items": {"type": "string"}}

    # Primitives
    if ann in _JSON_PRIMITIVES:
        return {"type": _JSON_PRIMITIVES[ann]}

    return {"type": "string"}


def _parse_docstring(docstring: str | None) -> dict[str, Any]:
    if not docstring:
        return {"description": "", "parameters": {}}

    lines = docstring.strip().split("\n")
    args_start = next((i for i, l in enumerate(lines) if l.strip().startswith("Args:")), -1)

    desc_lines = lines[:args_start] if args_start > 0 else lines
    description = "\n".join(l.strip() for l in desc_lines if l.strip())

    parameters: dict[str, dict[str, str]] = {}
    if args_start < 0:
        return {"description": description, "parameters": parameters}

    i = args_start + 1
    while i < len(lines):
        line = lines[i]
        match = re.match(r"^\s+(\w+)(?:\s*\([^)]*\))?\s*:\s*(.+)$", line)
        if match:
            name, pdesc = match.group(1), match.group(2).strip()
            indent = len(line) - len(line.lstrip())
            i += 1
            while i < len(lines):
                nxt = lines[i]
                if not nxt.strip():
                    break
                if len(nxt) - len(nxt.lstrip()) > indent and not re.match(r"^\s+\w+(?:\s*\([^)]*\))?\s*:", nxt):
                    pdesc += " " + nxt.strip()
                    i += 1
                else:
                    break
            parameters[name] = {"description": pdesc}
        else:
            i += 1

    return {"description": description, "parameters": parameters}


class ToolRegistry:
    def __init__(
        self,
        tool_dir: str | list[str] | None = None,
        dependencies: dict[str, Any] | None = None,
    ):
        self.dependencies = dependencies or {}
        self._injected_names = {"self", "cls"} | set(self.dependencies.keys())
        self._tools: dict[str, Callable] = {}

        if tool_dir:
            dirs = [tool_dir] if isinstance(tool_dir, str) else tool_dir
            for d in dirs:
                self._discover(d)

    # ── Discovery ────────────────────────────────────────────────────

    def _discover(self, tool_dir: str) -> None:
        try:
            pkg = importlib.import_module(tool_dir)
        except ImportError as e:
            logger.error(f"Failed to import tool directory '{tool_dir}': {e}")
            return

        for _, module_name, _ in pkgutil.iter_modules(pkg.__path__):
            if not module_name.endswith("_tools"):
                continue
            full = f"{tool_dir}.{module_name}"
            try:
                mod = importlib.import_module(full)
            except ImportError as e:
                logger.warning(f"Failed to import '{full}': {e}")
                continue

            for name, obj in inspect.getmembers(mod, inspect.isfunction):
                if obj.__module__ != full:
                    continue
                self.register(obj, name=name)

        logger.info(f"Loaded {len(self._tools)} tools from {tool_dir}")

    def register(self, fn: Callable, *, name: str | None = None) -> None:
        key = name or fn.__name__
        if key in self._tools:
            logger.warning(f"Tool '{key}' already registered, skipping")
            return
        self._tools[key] = fn

    # ── Schema generation ────────────────────────────────────────────

    def _build_schema(self, fn: Callable) -> dict[str, Any]:
        sig = inspect.signature(fn)
        doc_info = _parse_docstring(inspect.getdoc(fn))

        properties: dict[str, dict[str, Any]] = {}

        for pname, param in sig.parameters.items():
            # *** Skip injected dependencies — LLM never sees these ***
            if pname in self._injected_names:
                continue
            if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
                continue

            schema = _annotation_to_schema(param.annotation)

            # If default is None but type isn't already nullable, make nullable
            if param.default is None and isinstance(schema.get("type"), str) and schema["type"] != "null":
                schema["type"] = [schema["type"], "null"]

            if pname in doc_info["parameters"]:
                schema["description"] = doc_info["parameters"][pname]["description"]
            else:
                schema["description"] = f"The {pname} parameter."

            properties[pname] = schema

        # Flat structure for the Responses API
        return {
            "type": "function",
            "name": fn.__name__,
            "description": doc_info["description"] or f"Function {fn.__name__}",
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": list(properties.keys()),
                "additionalProperties": False,
            },
        }

    @property
    def tool_schemas(self) -> list[dict[str, Any]]:
        schemas = []
        for name, fn in self._tools.items():
            try:
                schemas.append(self._build_schema(fn))
            except Exception as e:
                logger.warning(f"Failed to build schema for '{name}': {e}")
        return schemas

    @property
    def tool_names(self) -> list[str]:
        return list(self._tools.keys())

    # ── Execution with dependency injection ──────────────────────────

    async def call(self, name: str, args: dict[str, Any]) -> str:
        fn = self._tools.get(name)
        if fn is None:
            return f"Error: tool '{name}' not found. Available: {self.tool_names}"

        sig = inspect.signature(fn)

        final_kwargs: dict[str, Any] = {}
        for pname, param in sig.parameters.items():
            if pname in args:
                # *** Came from the LLM ***
                final_kwargs[pname] = args[pname]
            elif pname in self.dependencies:
                # *** Injected at runtime — LLM never knew about this ***
                final_kwargs[pname] = self.dependencies[pname]
            elif param.default is not inspect.Parameter.empty:
                pass  # let Python use its default
            elif self._is_nullable(param.annotation):
                final_kwargs[pname] = None
            else:
                return f"Error: missing required parameter '{pname}' for tool '{name}'"

        try:
            if inspect.iscoroutinefunction(fn):
                result = await fn(**final_kwargs)
            else:
                result = fn(**final_kwargs)
            return self._serialize_result(result)
        except Exception as e:
            logger.error(f"Error calling tool '{name}': {e}", exc_info=True)
            return f"Error calling tool '{name}': {e}"

    @staticmethod
    def _is_nullable(ann: Any) -> bool:
        if ann is inspect.Parameter.empty:
            return False
        args = get_args(ann)
        if isinstance(ann, types.UnionType) or get_origin(ann) is Union:
            return type(None) in args
        return False

    @staticmethod
    def _serialize_result(result: Any) -> str:
        if isinstance(result, str):
            return result
        if isinstance(result, dict):
            if "data" in result:
                return str(result["data"])
            return json.dumps(result, default=str)
        return json.dumps(result, default=str)
