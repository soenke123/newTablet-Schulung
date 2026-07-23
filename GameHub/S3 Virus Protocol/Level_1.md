# Level: Level 1

- **Größe:** 12 × 9
- **Entities:** 20 · **Text:** 19 · **Custom:** 0

## ASCII-Vorschau

```
+---+---+---+---+---+---+---+---+---+---+---+---+
| V |   |   |   |   | H |   |   | F |   | w | h |
+---+---+---+---+---+---+---+---+---+---+---+---+
|   | K |   |   |   | H |   |   | F |   | = | = |
+---+---+---+---+---+---+---+---+---+---+---+---+
|   | k |   |   |   | W |   |   | F |   | l | s |
+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   | o |   | H |   |   | F | S |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   | = |   |   | H |   |   | F | F | F | F |
+---+---+---+---+---+---+---+---+---+---+---+---+
|   | v | = | y |   | H |   |   |   |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   |   |   | H |   |   |   |   |   | s |
+---+---+---+---+---+---+---+---+---+---+---+---+
|   | p |   |   |   | H |   | f | = | d |   | = |
+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   |   |   | H |   |   |   |   |   | w |
+---+---+---+---+---+---+---+---+---+---+---+---+
```

**Legende:** Großbuchstabe = Entity (V=VIRUS, F=FIREWALL, S=SYSTEM, W=WLAN, K=KEY, A=APP, H=HARDWARE, C=CACHE, #=CODE), kleiner Buchstabe = Text-Block, `=` = T_IS, `~` = T_MAKE, `,` = T_CODE, `?` = Custom-Block, Zahl = mehrere Blöcke auf einer Zelle.

## Daten (JSON, für Import ins Spiel)

```json
{
  "name": "Level 1",
  "w": 12,
  "h": 9,
  "hint": "",
  "entities": [
    {
      "kind": "VIRUS",
      "x": 0,
      "y": 0
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 0
    },
    {
      "kind": "FIREWALL",
      "x": 8,
      "y": 0
    },
    {
      "kind": "KEY",
      "x": 1,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 1
    },
    {
      "kind": "FIREWALL",
      "x": 8,
      "y": 1
    },
    {
      "kind": "WLAN",
      "x": 5,
      "y": 2
    },
    {
      "kind": "FIREWALL",
      "x": 8,
      "y": 2
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 3
    },
    {
      "kind": "FIREWALL",
      "x": 8,
      "y": 3
    },
    {
      "kind": "SYSTEM",
      "x": 9,
      "y": 3
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 4
    },
    {
      "kind": "FIREWALL",
      "x": 8,
      "y": 4
    },
    {
      "kind": "FIREWALL",
      "x": 9,
      "y": 4
    },
    {
      "kind": "FIREWALL",
      "x": 10,
      "y": 4
    },
    {
      "kind": "FIREWALL",
      "x": 11,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 5
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 6
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 7
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 8
    }
  ],
  "text": [
    {
      "kind": "T_WLAN",
      "x": 10,
      "y": 0
    },
    {
      "kind": "T_HARDWARE",
      "x": 11,
      "y": 0
    },
    {
      "kind": "T_IS",
      "x": 10,
      "y": 1
    },
    {
      "kind": "T_IS",
      "x": 11,
      "y": 1
    },
    {
      "kind": "T_KEY",
      "x": 1,
      "y": 2
    },
    {
      "kind": "T_LOCKED",
      "x": 10,
      "y": 2
    },
    {
      "kind": "T_STOP",
      "x": 11,
      "y": 2
    },
    {
      "kind": "T_OPEN",
      "x": 3,
      "y": 3
    },
    {
      "kind": "T_IS",
      "x": 2,
      "y": 4
    },
    {
      "kind": "T_VIRUS",
      "x": 1,
      "y": 5
    },
    {
      "kind": "T_IS",
      "x": 2,
      "y": 5
    },
    {
      "kind": "T_YOU",
      "x": 3,
      "y": 5
    },
    {
      "kind": "T_SYSTEM",
      "x": 11,
      "y": 6
    },
    {
      "kind": "T_PUSH",
      "x": 1,
      "y": 7
    },
    {
      "kind": "T_FIREWALL",
      "x": 7,
      "y": 7
    },
    {
      "kind": "T_IS",
      "x": 8,
      "y": 7
    },
    {
      "kind": "T_DEFEAT",
      "x": 9,
      "y": 7
    },
    {
      "kind": "T_IS",
      "x": 11,
      "y": 7
    },
    {
      "kind": "T_WIN",
      "x": 11,
      "y": 8
    }
  ],
  "custom": []
}
```
