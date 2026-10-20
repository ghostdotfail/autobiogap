# autobiogap

A [connectome-host](https://github.com/anima-research/connectome-host) extension providing a modified version of [context-manager](https://github.com/anima-research/context-manager)'s AutobiographicalStrategy. See package.json for what connectome stack versions are assumed.

## Setup

1. Run `bun run build`
2. Copy `dist/autobiogap-extension.js` to where you expect connectome-host extensions
3. Update recipe: change strategy type from `autobiographical` to `autobiogap` and add the extension
4. Restart connectome-host

```json
{
  "agent": {
    "name": "fooble",
    "model": "claude-fable-5",
    "strategy": {
      "type": "autobiogap",
      "headWindowTokens": 4000,
      "recentWindowTokens": 300000,
    }
  },
  "extensions": {
    "autobiogap": {
      "kind": "strategy",
      "path": "/home/fooble/fooble-cm/extensions/autobiogap-extension.js",
      "config": {
        "enable": true
      }
    }
  }
}
```
