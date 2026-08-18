# Group video calls

Lumina Direct supports private group video calls for up to six participants in the first release.

## Architecture

- Existing one-to-one calls remain unchanged.
- Private groups are backed by private Lumina rooms and selected from Direct contacts.
- Group sessions, participants and signaling use dedicated database tables.
- WebRTC media stays peer-to-peer/relayed through the existing ICE/TURN configuration; the API transports authenticated signaling only.
- Signaling is directed to a specific participant to support a small multiparty mesh.

## Mobile guardrails

The initial six-person cap limits simultaneous WebRTC peer connections on iPhone and Android. Video capture is constrained to a mobile-friendly resolution/frame rate and the UI respects safe areas.

## Privacy and lifecycle

Only invited group participants can discover a call. Joining a group call accepts the corresponding private-group invitation. Leaving a call removes only that participant; an active call can continue for the others and ends when nobody remains.
