# Level: Level 3

- **Größe:** 15 × 14
- **Entities:** 64 · **Text:** 24 · **Custom:** 0

## ASCII-Vorschau

```
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
| V |   |   | F | f |   | F | F |   | w | = | l | a | = | d |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   | H |   | = | F | F | h | = | s | A | A | A | A |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   | S | H |   | s | F | F |   |   |   |   |   |   | A |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
| H | H | H | H |   |   |   | F |   |   |   |   |   |   | A |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   |   |   |   |   | F |   | # |   |   |   | A |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   | v | = | y |   |   | F | A | A |   |   | = |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   |   |   |   |   | F | A |   |   |   |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   |   | , |   |   | F | A | k |   |   |   |   | A |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   | y |   |   |   | s |   | F | A |   |   |   |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   |   |   |   |   |   | F |   |   |   |   |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
|   |   | o |   |   |   | p | F |   | A |   | A |   |   |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
| F | W | F |   | = |   |   | F |   |   |   |   |   | A |   |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
| F | K | F |   |   |   |   | F | A |   |   |   |   |   | w |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
| F | F | F | F | F | F | F | F | A | A | A | A | A | A | A |
+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
```

**Legende:** Großbuchstabe = Entity (V=VIRUS, F=FIREWALL, S=SYSTEM, W=WLAN, K=KEY, A=APP, H=HARDWARE, C=CACHE, #=CODE), kleiner Buchstabe = Text-Block, `=` = T_IS, `~` = T_MAKE, `,` = T_CODE, `?` = Custom-Block, Zahl = mehrere Blöcke auf einer Zelle.

## Daten (JSON, für Import ins Spiel)

```json
{
  "name": "Level 3",
  "w": 15,
  "h": 14,
  "hint": "",
  "entities": [
    {
      "kind": "VIRUS",
      "x": 0,
      "y": 0
    },
    {
      "kind": "FIREWALL",
      "x": 3,
      "y": 0
    },
    {
      "kind": "FIREWALL",
      "x": 6,
      "y": 0
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 0
    },
    {
      "kind": "HARDWARE",
      "x": 3,
      "y": 1
    },
    {
      "kind": "FIREWALL",
      "x": 6,
      "y": 1
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 1
    },
    {
      "kind": "APP",
      "x": 11,
      "y": 1
    },
    {
      "kind": "APP",
      "x": 12,
      "y": 1
    },
    {
      "kind": "APP",
      "x": 13,
      "y": 1
    },
    {
      "kind": "APP",
      "x": 14,
      "y": 1
    },
    {
      "kind": "SYSTEM",
      "x": 2,
      "y": 2
    },
    {
      "kind": "HARDWARE",
      "x": 3,
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
      "kind": "APP",
      "x": 14,
      "y": 2
    },
    {
      "kind": "HARDWARE",
      "x": 0,
      "y": 3
    },
    {
      "kind": "HARDWARE",
      "x": 1,
      "y": 3
    },
    {
      "kind": "HARDWARE",
      "x": 2,
      "y": 3
    },
    {
      "kind": "HARDWARE",
      "x": 3,
      "y": 3
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 3
    },
    {
      "kind": "APP",
      "x": 14,
      "y": 3
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 4
    },
    {
      "kind": "CODE",
      "x": 9,
      "y": 4
    },
    {
      "kind": "APP",
      "x": 13,
      "y": 4
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 5
    },
    {
      "kind": "APP",
      "x": 8,
      "y": 5
    },
    {
      "kind": "APP",
      "x": 9,
      "y": 5
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 6
    },
    {
      "kind": "APP",
      "x": 8,
      "y": 6
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 7
    },
    {
      "kind": "APP",
      "x": 8,
      "y": 7
    },
    {
      "kind": "APP",
      "x": 14,
      "y": 7
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 8
    },
    {
      "kind": "APP",
      "x": 8,
      "y": 8
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 9
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 10
    },
    {
      "kind": "APP",
      "x": 9,
      "y": 10
    },
    {
      "kind": "APP",
      "x": 11,
      "y": 10
    },
    {
      "kind": "FIREWALL",
      "x": 0,
      "y": 11
    },
    {
      "kind": "WLAN",
      "x": 1,
      "y": 11
    },
    {
      "kind": "FIREWALL",
      "x": 2,
      "y": 11
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 11
    },
    {
      "kind": "APP",
      "x": 13,
      "y": 11
    },
    {
      "kind": "FIREWALL",
      "x": 0,
      "y": 12
    },
    {
      "kind": "KEY",
      "x": 1,
      "y": 12
    },
    {
      "kind": "FIREWALL",
      "x": 2,
      "y": 12
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 12
    },
    {
      "kind": "APP",
      "x": 8,
      "y": 12
    },
    {
      "kind": "FIREWALL",
      "x": 0,
      "y": 13
    },
    {
      "kind": "FIREWALL",
      "x": 1,
      "y": 13
    },
    {
      "kind": "FIREWALL",
      "x": 2,
      "y": 13
    },
    {
      "kind": "FIREWALL",
      "x": 3,
      "y": 13
    },
    {
      "kind": "FIREWALL",
      "x": 4,
      "y": 13
    },
    {
      "kind": "FIREWALL",
      "x": 5,
      "y": 13
    },
    {
      "kind": "FIREWALL",
      "x": 6,
      "y": 13
    },
    {
      "kind": "FIREWALL",
      "x": 7,
      "y": 13
    },
    {
      "kind": "APP",
      "x": 8,
      "y": 13
    },
    {
      "kind": "APP",
      "x": 9,
      "y": 13
    },
    {
      "kind": "APP",
      "x": 10,
      "y": 13
    },
    {
      "kind": "APP",
      "x": 11,
      "y": 13
    },
    {
      "kind": "APP",
      "x": 12,
      "y": 13
    },
    {
      "kind": "APP",
      "x": 13,
      "y": 13
    },
    {
      "kind": "APP",
      "x": 14,
      "y": 13
    }
  ],
  "text": [
    {
      "kind": "T_FIREWALL",
      "x": 4,
      "y": 0
    },
    {
      "kind": "T_WLAN",
      "x": 9,
      "y": 0
    },
    {
      "kind": "T_IS",
      "x": 10,
      "y": 0
    },
    {
      "kind": "T_LOCKED",
      "x": 11,
      "y": 0
    },
    {
      "kind": "T_APP",
      "x": 12,
      "y": 0
    },
    {
      "kind": "T_IS",
      "x": 13,
      "y": 0
    },
    {
      "kind": "T_DEFEAT",
      "x": 14,
      "y": 0
    },
    {
      "kind": "T_IS",
      "x": 5,
      "y": 1
    },
    {
      "kind": "T_HARDWARE",
      "x": 8,
      "y": 1
    },
    {
      "kind": "T_IS",
      "x": 9,
      "y": 1
    },
    {
      "kind": "T_STOP",
      "x": 10,
      "y": 1
    },
    {
      "kind": "T_STOP",
      "x": 5,
      "y": 2
    },
    {
      "kind": "T_VIRUS",
      "x": 2,
      "y": 5
    },
    {
      "kind": "T_IS",
      "x": 3,
      "y": 5
    },
    {
      "kind": "T_YOU",
      "x": 4,
      "y": 5
    },
    {
      "kind": "T_IS",
      "x": 12,
      "y": 5
    },
    {
      "kind": "T_CODE",
      "x": 4,
      "y": 7
    },
    {
      "kind": "T_KEY",
      "x": 9,
      "y": 7
    },
    {
      "kind": "T_YOU",
      "x": 1,
      "y": 8
    },
    {
      "kind": "T_SYSTEM",
      "x": 5,
      "y": 8
    },
    {
      "kind": "T_OPEN",
      "x": 2,
      "y": 10
    },
    {
      "kind": "T_PUSH",
      "x": 6,
      "y": 10
    },
    {
      "kind": "T_IS",
      "x": 4,
      "y": 11
    },
    {
      "kind": "T_WIN",
      "x": 14,
      "y": 12
    }
  ],
  "custom": []
}
```
