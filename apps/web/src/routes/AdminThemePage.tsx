import { useEffect, useState } from 'react';
import type { ThemeSettings } from '@potion/shared';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { getAdminThemeSettings, updateAdminThemeSettings } from '../lib/api';
import { applyThemeSettings } from '../lib/theme';

type AdminThemePageProps = {
  token: string;
};

const themeFields: { key: keyof ThemeSettings; label: string; description: string }[] = [
  { key: 'backgroundColor', label: 'Background', description: 'Page and app background' },
  { key: 'textColor', label: 'Text', description: 'Primary text and inverse surfaces' },
  { key: 'accentColor', label: 'Accent', description: 'Buttons, links, icons, and scanner frame' },
  { key: 'dangerColor', label: 'Danger', description: 'Errors and destructive actions' },
  { key: 'successColor', label: 'Success', description: 'Success messages and valid states' },
  { key: 'warningColor', label: 'Warning', description: 'Warnings and attention states' },
];

export default function AdminThemePage({ token }: AdminThemePageProps) {
  const [theme, setTheme] = useState<ThemeSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const {
    toastMessage,
    toastTone,
    toastVersion,
    isToastClosing,
    showToast,
    dismissToast,
    handleToastTouchStart,
    handleToastTouchEnd,
    handleToastTouchCancel,
  } = useToast();

  useEffect(() => {
    let isCurrent = true;

    getAdminThemeSettings(token)
      .then((result) => {
        if (!isCurrent) return;
        setTheme(result.theme);
        applyThemeSettings(result.theme);
      })
      .catch((error) => {
        if (isCurrent)
          showToast(
            error instanceof Error ? error.message : 'Could not load theme settings.',
            'error',
          );
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  function updateColor(key: keyof ThemeSettings, value: string) {
    if (!theme) return;
    const nextTheme = { ...theme, [key]: value };
    setTheme(nextTheme);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!theme || isSaving) return;

    setIsSaving(true);

    try {
      const result = await updateAdminThemeSettings(theme, token);
      setTheme(result.theme);
      applyThemeSettings(result.theme);
      showToast('Theme saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save the theme.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <ToastRegion
        isClosing={isToastClosing}
        message={toastMessage}
        tone={toastTone}
        version={toastVersion}
        onDismiss={dismissToast}
        onTouchStart={handleToastTouchStart}
        onTouchEnd={handleToastTouchEnd}
        onTouchCancel={handleToastTouchCancel}
      />
      <section className="content-panel admin-theme-panel">
        <div className="admin-theme-header">
          <p className="eyebrow">Appearance</p>
          <h1>Theme Colors</h1>
          <p className="status-text">
            Hover, border, overlay, and muted colors are calculated automatically.
          </p>
        </div>

        {theme ? (
          <form className="stack-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="admin-theme-grid">
              {themeFields.map((field) => (
                <label className="admin-theme-color-field" key={field.key}>
                  <span>
                    <strong>{field.label}</strong>
                    <small>{field.description}</small>
                  </span>
                  <span className="admin-theme-color-control">
                    <input
                      type="color"
                      value={theme[field.key]}
                      aria-label={`${field.label} color`}
                      onChange={(event) => updateColor(field.key, event.target.value)}
                    />
                    <code>{theme[field.key]}</code>
                  </span>
                </label>
              ))}
            </div>

            <div className="admin-theme-actions">
              <button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Theme'}
              </button>
            </div>
          </form>
        ) : null}
      </section>
      {isLoading ? (
        <LoadingOverlay label="Loading theme" detail="Fetching saved colors." variant="account" />
      ) : null}
    </>
  );
}
