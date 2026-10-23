export function createSettingsInput(React) {
  return ({
    label,
    title,
    hint,
    description,
    initialValue,
    onChangeText,
    placeholder,
    disabled,
    secureTextEntry,
  }) => {
    const displayLabel = label ?? title;
    const displayHint = hint ?? description;
    return React.createElement(
      "div",
      { "data-testid": `settings-input-${displayLabel}` },
      React.createElement("span", null, displayLabel),
      displayHint ? React.createElement("span", null, displayHint) : null,
      React.createElement("input", {
        type: secureTextEntry ? "password" : "text",
        defaultValue: initialValue ?? "",
        placeholder,
        disabled,
        onChange: (e) => onChangeText(e.target.value),
      }),
    );
  };
}
