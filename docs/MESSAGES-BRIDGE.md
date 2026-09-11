# MONDAY Messages Bridge

Messages is a first-class MONDAY conversation surface, not a notification-only
escape hatch. The Mac bridge observes one explicitly configured contact and
keeps the resulting conversation in the same local MONDAY workspace.

## What the first build does

- Reads only new, direct incoming Messages from the configured iMessage handle.
- Starts at the enablement cursor; it does not replay or ingest previous chats.
- Sends MONDAY's response back through the same iMessage conversation.
- Lets Chris authorize a single proposed action by replying `APPROVE ABCD1234`,
  or reject it with `DECLINE ABCD1234`.
- Records the request, approval, action, and result in the local MONDAY audit.
- Notices attachments and retains their local filenames as conversation context.

## What it deliberately does not do

- It does not scan the whole Messages inbox or watch group chats.
- It does not treat a bare `yes` as action authority.
- It does not import raw message history into MONDAY Knowledge.
- It does not yet perform image understanding. An image-capable intelligence
  specialist must be added before a received photo is sent to any model.
- It does not claim SMS or RCS support. The first sender uses iMessage only.

## Provisioning

For MONDAY to be a distinct person in Messages, give her a dedicated Apple
Account/iMessage address. The Mac account that runs MONDAY must be signed into
Messages as that identity. Keep Chris's personal Messages account separate;
otherwise this becomes a confusing message-to-yourself loop.

On that Mac account:

1. Install and launch MONDAY.
2. In **Trust Center**, turn on **Read MONDAY conversation** and **Reply in
   Messages**.
3. Enter Chris's iMessage address or phone number as the sole trusted contact.
4. Grant MONDAY **Full Disk Access** when macOS requests access to the local
   Messages database.
5. Grant MONDAY **Automation → Messages** when macOS requests permission to
   send the first reply.
6. Send MONDAY a normal iMessage and confirm the reply in the same thread.

The bridge runs while the Mac app is running. Background launch/login behavior
is intentionally a separate opt-in, not an invisible always-on process.
