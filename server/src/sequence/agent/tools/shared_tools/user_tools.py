import json


def ask_user_question(
    question: str,
    options: list[str],
    option_descriptions: list[str] | None,
    multi_select: bool,
) -> str:
    """
    Pause execution and ask the user a clarifying question before proceeding.
    Use this when there are multiple valid approaches and user input is needed
    to continue. Present clear, distinct options for the user to choose from.

    Args:
        question: The full question text to display to the user (e.g. "How should errors be handled?").
        options: The selectable option labels to present to the user
            (e.g. ["Fail fast", "Retry", "Log and continue"]).
            Do NOT include a "Custom" or free-text option — the UI provides this automatically.
        option_descriptions: A description for each option in the same order as options,
            explaining the tradeoff or implication of each choice
            (e.g. ["Stop immediately on error", "Auto-retry up to 3 times", "Non-blocking, resumes execution"]).
            Pass null if options are self-explanatory.
        multi_select: If true, the user may select multiple options. If false, only one selection is allowed.
    """

    descriptions = [desc if isinstance(desc, str) else "" for desc in (option_descriptions or [])]
    if len(descriptions) < len(options):
        descriptions.extend([""] * (len(options) - len(descriptions)))
    elif len(descriptions) > len(options):
        descriptions = descriptions[: len(options)]

    llm_instructions = (
        "DO NOT repeat the question back to the user. This will be rendered by the frontend. "
        "Concisely tell the user that you will proceed based on their response. "
        "User will also be presented with a free-text input field to provide a custom response - the field is called 'Additional context (optional)'."
        "The response will be presented in format\n```\nQ: {question}\nA:\n -{options}\n```"
    )
    payload = {
        "question": question,
        "options": options,
        "option_descriptions": descriptions,
        "multi_select": bool(multi_select),
        "allow_custom_response": True,
        "LLM Instructions": llm_instructions,
    }
    return json.dumps(payload)
