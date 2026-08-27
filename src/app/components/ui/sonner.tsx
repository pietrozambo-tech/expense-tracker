import { useEffect, useState } from 'react';
import { Toaster as Sonner, ToasterProps } from 'sonner';

// The toast follows THE APP's theme, read off <html data-theme> - the one
// place the app's own dark mode actually lives (lib/themeMode.ts).
//
// The stock shadcn version of this file asked next-themes instead, a library
// this app does not use: with no provider that answered "system", so sonner
// followed the OS and painted its DARK text palette (pale description ink)
// whenever the phone was dark - while --normal-bg stayed white, because it
// pointed at --popover, whose dark value sits under a `.dark` class nothing
// ever sets. Result: near-white description text on a white card, which is
// how "Demo data loaded"'s subtitle became invisible at night.
//
// Watching the attribute rather than importing app state keeps this file
// dependency-free and correct even when the mode changes mid-session (the
// Appearance setting, or the OS flipping at dusk while set to Auto).
function useAppTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  );
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    read();
    return () => mo.disconnect();
  }, []);
  return theme;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useAppTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          // The app's own surface tokens, which flip with data-theme - not the
          // shadcn --popover set, which only flips under a class nothing sets.
          '--normal-bg': 'var(--bg-card)',
          '--normal-text': 'var(--ink)',
          '--normal-border': 'var(--line)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
