# OpenAI API key setup

## Binding spend policy

MONDAY starts with manual approval for every external-model call and a $0 automatic monthly budget. No background or silent OpenAI request is authorized. There are no authorized automatic request classes, and pro/max modes are disabled.

Before approval, MONDAY must disclose the provider, exact model, purpose, context leaving the Apple boundary, maximum input and output tokens, and maximum estimated cost. Approval is tied to that exact request, expires promptly, and can be consumed only once. A later budget or automatic request class requires an explicit policy change after real usage has been reviewed.

Do not paste an OpenAI API key into chat, source code, an Xcode build setting,
an app bundle, or a committed environment file.

MONDAY's local development workflow stores the key in the macOS login Keychain:

~~~sh
cd /Users/chris/Desktop/CODE/MONDAY
./scripts/set_openai_key
~~~

Enter the key only when the macOS `security` prompt requests it. The prompt is
hidden, and the script does not receive the key as a command-line argument.

Check whether a credential exists without revealing it:

~~~sh
./scripts/openai_key_status
~~~

Run a local command with the key available only as `OPENAI_API_KEY` in that
command's process:

~~~sh
./scripts/with_openai_key your-command --your-arguments
~~~

Remove the credential:

~~~sh
./scripts/remove_openai_key
~~~

## Native-app boundary

The OpenAI secret key must not be embedded in MONDAY's iPhone, iPad, Watch,
CarPlay, or Mac application. A production OpenAI route must terminate at a
controlled server-side relay that stores its own scoped secret, enforces user
identity, rate limits requests, minimizes disclosed context, and records model
usage without logging prompts or credentials. The native app receives a
short-lived authenticated application session, never the provider secret.

This Keychain item is for local development and for authorized deployment
commands run from this Mac. It does not silently enable an external model in
MONDAY; model routing and disclosure remain governed by MONDAY's Trust Center.
