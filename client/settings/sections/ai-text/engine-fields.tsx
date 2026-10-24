import {
  SettingsInput,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import {
  getAiTextEngineDescriptor,
  visibleEngineFields,
  type AiTextProfile,
} from "../../../../shared/contracts.js";

export function EngineFields({
  profile,
  disabled,
  onChange,
}: {
  profile: AiTextProfile;
  disabled: boolean;
  onChange(config: Record<string, unknown>): void;
}) {
  const descriptor = getAiTextEngineDescriptor(profile.engineId);
  if (!descriptor) {
    return null;
  }
  const fields = visibleEngineFields(descriptor, profile.config, profile.route);
  if (fields.length === 0) {
    return null;
  }

  const setValue = (key: string, value: unknown) => {
    onChange({ ...profile.config, [key]: value });
  };

  return (
    <>
      {fields.map((field) => {
        const inputKey = `${profile.engineId}:${profile.route}:${field.key}`;
        const value = profile.config[field.key];
        const description = field.description;

        if (field.kind === "switch") {
          return (
            <SettingsSwitch
              key={inputKey}
              label={field.label}
              hint={description}
              value={Boolean(value)}
              disabled={disabled}
              onValueChange={(next) => setValue(field.key, next)}
              testID={`file-explorer-setting-engine-field-${profile.engineId}-${field.key}`}
            />
          );
        }

        if (field.kind === "select") {
          return (
            <SettingsSelect
              key={inputKey}
              label={field.label}
              hint={description}
              value={String(value ?? "")}
              options={field.options ?? []}
              disabled={disabled}
              onValueChange={(next) => setValue(field.key, next)}
              testID={`file-explorer-setting-engine-field-${profile.engineId}-${field.key}`}
            />
          );
        }

        if (field.kind === "number") {
          return (
            <SettingsInput
              key={inputKey}
              label={field.label}
              hint={description}
              initialValue={value === undefined ? "" : String(value)}
              placeholder={field.placeholder}
              disabled={disabled}
              onChangeText={(text) => {
                const parsed = Number.parseInt(text, 10);
                if (!Number.isFinite(parsed)) return;
                const min = field.min ?? Number.NEGATIVE_INFINITY;
                const max = field.max ?? Number.POSITIVE_INFINITY;
                const clamped = Math.min(max, Math.max(min, parsed));
                setValue(field.key, clamped);
              }}
              testID={`file-explorer-setting-engine-field-${profile.engineId}-${field.key}`}
            />
          );
        }

        return (
          <SettingsInput
            key={inputKey}
            label={field.label}
            hint={description}
            initialValue={value === undefined ? "" : String(value)}
            placeholder={field.placeholder}
            secureTextEntry={field.kind === "password"}
            disabled={disabled}
            onChangeText={(text) => setValue(field.key, text)}
            testID={`file-explorer-setting-engine-field-${profile.engineId}-${field.key}`}
          />
        );
      })}
    </>
  );
}
