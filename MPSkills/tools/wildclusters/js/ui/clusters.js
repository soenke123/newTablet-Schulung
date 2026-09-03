/**
 * Die Gruppierung selbst - wer gehoert mit wem zusammen.
 *
 * Das ist die Antwort, die die Schuelerinnen und Schueler geben: acht Arten
 * liegen als rund vierzig namenlose Signale vor, und aus dem, was die Spuren
 * zeigen, soll wieder eine Einteilung werden. Das Modell weiss davon nichts -
 * es kennt keine Arten, keine Tiere und keine richtige Loesung, sondern nur
 * Nummern und Haufen.
 *
 * Bewusst ohne jeden DOM-Zugriff: die Regeln des Zusammenfuegens (was passiert,
 * wenn ich ein Cluster auf ein einzelnes Signal ziehe? was wird aus einem
 * Cluster, dem das vorletzte Mitglied entzogen wird?) sind der Teil, der
 * schiefgehen kann, und der laesst sich so in tools/uitest.js ohne Layout
 * pruefen. Das Ziehen und Zeichnen liegt in js/ui/signals.js.
 *
 * Gerechnet wird in *Signalnummern* (0-basiert, die Nummer auf der Kachel
 * minus eins), nicht in Tiernummern. Welches Tier hinter einer Nummer steckt,
 * ist gemischt und geht nur die Liste etwas an - hier waere es ein Hinweis auf
 * die Loesung.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  /** Kurzform fuer einen Griff: ein einzelnes Signal. */
  function signalHandle(index) { return { kind: 'signal', id: index }; }

  /** Kurzform fuer einen Griff: ein ganzes Cluster. */
  function groupHandle(id) { return { kind: 'group', id: id }; }

  function create() {
    var model = {};

    var count = 0;
    var baseColors = [];   // Farbe je Signal, solange es allein steht
    var groupIds = [];     // Cluster je Signal, -1 = ohne Gruppe
    var groups = [];       // { id, color, members: [signal...] }, in Entstehungsreihenfolge
    var nextId = 1;

    /**
     * Neue Welt: alles allein, jedes Signal in seiner eigenen Farbe. Die
     * Farben kommen von aussen (WL.PALETTE.signals.build), damit dieselbe
     * Nummer auf der Karte und in der Liste dieselbe Farbe hat.
     */
    model.setCount = function (n, colors) {
      count = n | 0;
      baseColors = colors || [];
      groupIds = [];
      groups = [];
      nextId = 1;
      for (var i = 0; i < count; i++) groupIds.push(-1);
    };

    model.count = function () { return count; };

    /** Cluster-Id dieses Signals, oder -1. */
    model.groupOf = function (signal) {
      return (signal >= 0 && signal < count) ? groupIds[signal] : -1;
    };

    /** Die Farbe, in der dieses Signal gerade erscheint - eigene oder die des Clusters. */
    model.colorOf = function (signal) {
      var g = model.group(model.groupOf(signal));
      if (g) return g.color;
      return baseColors[signal] || WL.PALETTE.signals.fallback;
    };

    /** Die Farbe, die dieses Signal allein haette. */
    model.baseColorOf = function (signal) {
      return baseColors[signal] || WL.PALETTE.signals.fallback;
    };

    model.group = function (id) {
      for (var i = 0; i < groups.length; i++) if (groups[i].id === id) return groups[i];
      return null;
    };

    /** Alle Cluster in Entstehungsreihenfolge - die Liste ordnet danach. */
    model.groups = function () { return groups; };

    /** Alle Signale ohne Cluster, nach Nummer sortiert. */
    model.loose = function () {
      var out = [];
      for (var i = 0; i < count; i++) if (groupIds[i] < 0) out.push(i);
      return out;
    };

    /** Die Signale hinter einem Griff - ein einzelnes oder ein ganzes Cluster. */
    model.membersOf = function (handle) {
      if (!handle) return [];
      if (handle.kind === 'group') {
        var g = model.group(handle.id);
        return g ? g.members.slice() : [];
      }
      return (handle.id >= 0 && handle.id < count) ? [handle.id] : [];
    };

    /**
     * Zusammenfuegen. Quelle und Ziel sind Griffe: ein einzelnes Signal oder
     * ein ganzes Cluster, in jeder Kombination - genau das, was sich mit dem
     * Finger machen laesst.
     *
     * Die Farbe des *Ziels* gewinnt immer. Damit behaelt ein Cluster seine
     * Farbe, solange man Tiere hineinzieht, und ein wachsender Haufen bleibt
     * ueber alle Schritte derselbe Haufen. Wer umgekehrt ein grosses Cluster
     * auf ein einzelnes Signal zieht, faerbt es auf dessen Farbe um - das ist
     * dieselbe Regel und deshalb vorhersagbar.
     *
     * @returns true, wenn sich etwas geaendert hat.
     */
    model.join = function (source, target) {
      if (!model.canJoin(source, target)) return false;
      var moving = model.membersOf(source);
      var into = resolveTarget(target);
      var group = into.group;
      if (!group) {
        group = { id: nextId++, color: baseColors[into.anchor], members: [into.anchor] };
        groupIds[into.anchor] = group.id;
        groups.push(group);
      } else {
        group.color = into.color;
      }

      for (var i = 0; i < moving.length; i++) {
        var signal = moving[i];
        if (groupIds[signal] === group.id) continue;
        leave(signal);
        groupIds[signal] = group.id;
        group.members.push(signal);
      }
      group.members.sort(ascending);
      prune();
      return true;
    };

    /**
     * Wuerde dieses Zusammenfuegen etwas aendern? Die Liste fragt das
     * waehrend des Ziehens, um nur die Ziele hell zu umranden, an denen das
     * Loslassen wirklich etwas bewirkt - ein Rahmen, der nichts verspricht,
     * ist schlimmer als keiner.
     */
    model.canJoin = function (source, target) {
      if (!source || !target) return false;
      var moving = model.membersOf(source);
      if (!moving.length) return false;
      var into = resolveTarget(target);
      if (!into) return false;
      // Auf sich selbst gezogen, auf ein eigenes Mitglied, oder in das
      // Cluster, in dem schon alles davon steckt: kein Fehler, aber auch
      // keine Aenderung - und die Liste soll dafuer nicht neu aufgebaut
      // werden, sonst zuckt sie bei jedem verrutschten Finger.
      if (moving.indexOf(into.anchor) >= 0) return false;
      if (into.group && allIn(moving, into.group.id)) return false;
      return true;
    };

    /** Gegenstueck zu canJoin: steckt hier ueberhaupt etwas in einem Cluster? */
    model.canDetach = function (handle) {
      if (!handle) return false;
      if (handle.kind === 'group') return !!model.group(handle.id);
      return model.groupOf(handle.id) >= 0;
    };

    /**
     * Herausziehen: ein Signal verlaesst sein Cluster, ein ganzes Cluster
     * loest sich auf. Der Weg zurueck zu "ohne Gruppierung" - ohne ihn waere
     * ein Fehlgriff endgueltig.
     *
     * @returns true, wenn sich etwas geaendert hat.
     */
    model.detach = function (handle) {
      if (!handle) return false;
      if (handle.kind === 'group') {
        var g = model.group(handle.id);
        if (!g) return false;
        for (var i = 0; i < g.members.length; i++) groupIds[g.members[i]] = -1;
        groups.splice(groups.indexOf(g), 1);
        return true;
      }
      if (model.groupOf(handle.id) < 0) return false;
      leave(handle.id);
      prune();
      return true;
    };

    /**
     * Ein Cluster von aussen setzen - der Weg fuer die Nachzuegler am Bruch
     * bei Tag 5.
     *
     * Anders als join() gibt es hier kein Ziel, in das hineingezogen wird, und
     * genau das ist die Aussage: die Nachzuegler gehoeren in keine der
     * gebildeten Gruppen, sie machen einen eigenen Kasten auf. Ihre Farbe
     * kommt deshalb auch von aussen und nicht aus baseColors - sie ist keine
     * Signalfarbe (js/render/palette.js, signals.newcomer).
     *
     * Was bereits gruppiert war, bleibt gruppiert; nur die genannten Signale
     * verlassen ihr altes Cluster, und was davon zu klein wird, faellt wie
     * ueberall auseinander.
     *
     * @returns die Id des neuen Clusters, oder -1.
     */
    model.formGroup = function (signals, color) {
      var members = [];
      var i;
      for (i = 0; i < (signals || []).length; i++) {
        var s = signals[i];
        if (s < 0 || s >= count || members.indexOf(s) >= 0) continue;
        members.push(s);
      }
      // Ein Cluster aus einem einzigen Tier gibt es nicht - hier so wenig wie
      // beim Ziehen (siehe prune).
      if (members.length < 2) return -1;

      for (i = 0; i < members.length; i++) leave(members[i]);
      var group = { id: nextId++, color: color || baseColors[members[0]], members: members };
      for (i = 0; i < members.length; i++) groupIds[members[i]] = group.id;
      members.sort(ascending);
      groups.push(group);
      prune();
      return group.id;
    };

    /** Alles zurueck auf Anfang, ohne die Farben neu zu ziehen. */
    model.clear = function () {
      for (var i = 0; i < count; i++) groupIds[i] = -1;
      groups = [];
      return true;
    };

    // ------------------------------------------------------------ intern

    /**
     * Wohin faellt der Griff? Ein Signal *innerhalb* eines Clusters meint das
     * Cluster - beim Ziehen mit dem Finger trifft man die Kachel, nicht den
     * Rahmen darum.
     */
    function resolveTarget(handle) {
      if (handle.kind === 'group') {
        var g = model.group(handle.id);
        if (!g) return null;
        return { group: g, color: g.color, anchor: g.members[0] };
      }
      if (handle.id < 0 || handle.id >= count) return null;
      var inGroup = model.group(groupIds[handle.id]);
      return inGroup
        ? { group: inGroup, color: inGroup.color, anchor: handle.id }
        : { group: null, color: baseColors[handle.id], anchor: handle.id };
    }

    function leave(signal) {
      var g = model.group(groupIds[signal]);
      groupIds[signal] = -1;
      if (!g) return;
      var at = g.members.indexOf(signal);
      if (at >= 0) g.members.splice(at, 1);
    }

    /**
     * Ein Cluster aus einem einzigen Tier ist keine Gruppe, sondern ein Tier
     * mit Rahmen. Es faellt deshalb auseinander, sobald ihm das vorletzte
     * Mitglied entzogen wird - sonst blieben leere Kaesten in der Liste
     * stehen, die niemand mehr aufloest.
     */
    function prune() {
      for (var i = groups.length - 1; i >= 0; i--) {
        if (groups[i].members.length >= 2) continue;
        for (var k = 0; k < groups[i].members.length; k++) groupIds[groups[i].members[k]] = -1;
        groups.splice(i, 1);
      }
    }

    function allIn(signals, groupId) {
      for (var i = 0; i < signals.length; i++) if (groupIds[signals[i]] !== groupId) return false;
      return true;
    }

    function ascending(a, b) { return a - b; }

    return model;
  }

  WL.Clusters = { create: create, signal: signalHandle, group: groupHandle };
})(typeof window !== 'undefined' ? window : globalThis);
