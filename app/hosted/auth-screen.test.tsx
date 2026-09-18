import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SignInPanel } from './auth-screen';

describe('sign-in presentation', () => {
  it('renders a standalone account gate with one Google action', () => {
    const html = renderToStaticMarkup(
      <SignInPanel signingIn={false} error={null} onSignIn={() => {}} />,
    );
    expect(html).toContain('class="auth-screen"');
    expect(html).toContain('Welcome to Windie.');
    expect(html).toContain('Continue with Google');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain('data-slot="sidebar');
    expect(html).not.toContain('disabled=');
  });

  it('exposes the pending redirect and prevents another sign-in click', () => {
    const html = renderToStaticMarkup(
      <SignInPanel signingIn error={null} onSignIn={() => {}} />,
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Opening Google…');
  });

  it('keeps sign-in errors accessible and escapes their content', () => {
    const html = renderToStaticMarkup(
      <SignInPanel
        signingIn={false}
        error={'Please retry <login>'}
        onSignIn={() => {}}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Please retry &lt;login&gt;');
  });
});
