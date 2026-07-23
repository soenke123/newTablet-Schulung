# Level: Level 2

- **Größe:** 13 × 15
- **Entities:** 64 · **Text:** 26 · **Custom:** 0

## ASCII-Vorschau

```
+---+---+---+---+---+---+---+---+---+---+---+---+---+
| A |   |   | H | f | = | d | h | = | s | s | = | w |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   | H | H | H | H | H | H | H | H | H | H |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   | F | F | F | F | F | F | F |   | S | H |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   | F | F | F | F | F | F | F |   |   | H |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
| H | H | H | H | H | H | H | H | H | H | H | H | H |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
| H |   | v |   |   |   | H | w | = | l |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
| H |   | = |   |   |   | H |   |   |   |   |   | = |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
| H |   | y |   |   |   | H |   |   |   |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
| H | H | H | H | W | H | H |   |   | k |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   |   |   |   |   |   |   |   |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   |   |   | A |   |   |   |   |   | H |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   | , | = | p |   |   |   |   |   |   |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   |   |   |   | H | H | H |   |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   | k |   |   |   | F | K | F |   |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
| V |   |   |   |   |   | a | ~ | , |   |   |   | o |
+---+---+---+---+---+---+---+---+---+---+---+---+---+
```

**Legende:** Großbuchstabe = Entity (V=VIRUS, F=FIREWALL, S=SYSTEM, W=WLAN, K=KEY, A=APP, H=HARDWARE, C=CACHE, #=CODE), kleiner Buchstabe = Text-Block, `=` = T_IS, `~` = T_MAKE, `,` = T_CODE, `?` = Custom-Block, Zahl = mehrere Blöcke auf einer Zelle.

## Daten (JSON, für Import ins Spiel)

```json
{
  "name": "Level 2",
  "w": 13,
  "h": 15,
  "hint": "",
  "entities": [
    {
      "kind": "APP",
      "x": 0,
      "y": 0
    },
    {
      "kind": "HARDWARE",
      "x": 3,
      "y": 0
    },
    {
      "kind": "HARDWARE",
      "x": 3,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 4,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 6,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 7,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 8,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 9,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 10,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 11,
      "y": 1
    },
    {
      "kind": "HARDWARE",
      "x": 12,
      "y": 1
    },
    {
      "kind": "FIREWALL",
      "x": 3,
      "y": 2
    },
    {
      "kind": "FIREWALL",
      "x": 4,
      "y": 2
    },
    {
      "kind": "FIREWALL",
      "x": 5,
      "y": 2
    },
    {
      "kind": "FIREWALL",
      "x": 6,
      "y": 2
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 2
    },
    {
      "kind": "FIREWALL",
      "x": 8,
      "y": 2
    },
    {
      "kind": "FIREWALL",
      "x": 9,
      "y": 2
    },
    {
      "kind": "SYSTEM",
      "x": 11,
      "y": 2
    },
    {
      "kind": "HARDWARE",
      "x": 12,
      "y": 2
    },
    {
      "kind": "FIREWALL",
      "x": 3,
      "y": 3
    },
    {
      "kind": "FIREWALL",
      "x": 4,
      "y": 3
    },
    {
      "kind": "FIREWALL",
      "x": 5,
      "y": 3
    },
    {
      "kind": "FIREWALL",
      "x": 6,
      "y": 3
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 3
    },
    {
      "kind": "FIREWALL",
      "x": 8,
      "y": 3
    },
    {
      "kind": "FIREWALL",
      "x": 9,
      "y": 3
    },
    {
      "kind": "HARDWARE",
      "x": 12,
      "y": 3
    },
    {
      "kind": "HARDWARE",
      "x": 0,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 1,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 2,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 3,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 4,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 6,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 7,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 8,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 9,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 10,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 11,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 12,
      "y": 4
    },
    {
      "kind": "HARDWARE",
      "x": 0,
      "y": 5
    },
    {
      "kind": "HARDWARE",
      "x": 6,
      "y": 5
    },
    {
      "kind": "HARDWARE",
      "x": 0,
      "y": 6
    },
    {
      "kind": "HARDWARE",
      "x": 6,
      "y": 6
    },
    {
      "kind": "HARDWARE",
      "x": 0,
      "y": 7
    },
    {
      "kind": "HARDWARE",
      "x": 6,
      "y": 7
    },
    {
      "kind": "HARDWARE",
      "x": 0,
      "y": 8
    },
    {
      "kind": "HARDWARE",
      "x": 1,
      "y": 8
    },
    {
      "kind": "HARDWARE",
      "x": 2,
      "y": 8
    },
    {
      "kind": "HARDWARE",
      "x": 3,
      "y": 8
    },
    {
      "kind": "WLAN",
      "x": 4,
      "y": 8
    },
    {
      "kind": "HARDWARE",
      "x": 5,
      "y": 8
    },
    {
      "kind": "HARDWARE",
      "x": 6,
      "y": 8
    },
    {
      "kind": "APP",
      "x": 5,
      "y": 10
    },
    {
      "kind": "HARDWARE",
      "x": 11,
      "y": 10
    },
    {
      "kind": "HARDWARE",
      "x": 6,
      "y": 12
    },
    {
      "kind": "HARDWARE",
      "x": 7,
      "y": 12
    },
    {
      "kind": "HARDWARE",
      "x": 8,
      "y": 12
    },
    {
      "kind": "FIREWALL",
      "x": 6,
      "y": 13
    },
    {
      "kind": "KEY",
      "x": 7,
      "y": 13
    },
    {
      "kind": "FIREWALL",
      "x": 8,
      "y": 13
    },
    {
      "kind": "VIRUS",
      "x": 0,
      "y": 14
    }
  ],
  "text": [
    {
      "kind": "T_FIREWALL",
      "x": 4,
      "y": 0
    },
    {
      "kind": "T_IS",
      "x": 5,
      "y": 0
    },
    {
      "kind": "T_DEFEAT",
      "x": 6,
      "y": 0
    },
    {
      "kind": "T_HARDWARE",
      "x": 7,
      "y": 0
    },
    {
      "kind": "T_IS",
      "x": 8,
      "y": 0
    },
    {
      "kind": "T_STOP",
      "x": 9,
      "y": 0
    },
    {
      "kind": "T_SYSTEM",
      "x": 10,
      "y": 0
    },
    {
      "kind": "T_IS",
      "x": 11,
      "y": 0
    },
    {
      "kind": "T_WIN",
      "x": 12,
      "y": 0
    },
    {
      "kind": "T_VIRUS",
      "x": 2,
      "y": 5
    },
    {
      "kind": "T_WLAN",
      "x": 7,
      "y": 5
    },
    {
      "kind": "T_IS",
      "x": 8,
      "y": 5
    },
    {
      "kind": "T_LOCKED",
      "x": 9,
      "y": 5
    },
    {
      "kind": "T_IS",
      "x": 2,
      "y": 6
    },
    {
      "kind": "T_KEY",
      "x": 7,
      "y": 6
    },
    {
      "kind": "T_IS",
      "x": 8,
      "y": 6
    },
    {
      "kind": "T_OPEN",
      "x": 9,
      "y": 6
    },
    {
      "kind": "T_YOU",
      "x": 2,
      "y": 7
    },
    {
      "kind": "T_CODE",
      "x": 1,
      "y": 11
    },
    {
      "kind": "T_IS",
      "x": 2,
      "y": 11
    },
    {
      "kind": "T_PUSH",
      "x": 3,
      "y": 11
    },
    {
      "kind": "T_APP",
      "x": 9,
      "y": 12
    },
    {
      "kind": "T_KEY",
      "x": 2,
      "y": 13
    },
    {
      "kind": "T_APP",
      "x": 6,
      "y": 14
    },
    {
      "kind": "T_MAKE",
      "x": 7,
      "y": 14
    },
    {
      "kind": "T_CODE",
      "x": 8,
      "y": 14
    }
  ],
  "custom": []
}
```
