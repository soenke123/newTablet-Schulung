/* Slot-Pool: die einzige Wahrheit darüber, wer gerade arbeitet.
   Kein separater State — wir leiten die belegten Slots direkt aus dem
   bestehenden Domain-State ab (techtree, campaigns, werbeagentur, supportProgram, ccState).
   Kapazität kommt aus RT.team.getSlotCapacity().

   API:
     list()           → Array<Slot-Objekt> — 1 Eintrag = 1 Slot
     capacity()       → Zahl (aus Team-Stufe)
     used()           → belegte Slot-Anzahl
     free()           → verbleibende Slot-Anzahl
     canAllocate(n=1) → true wenn n Slots frei sind

   Slot-Objekt-Felder:
     label          — menschenlesbarer Text
     icon           — Emoji
     taskType       — 'techtree' | 'pending' | 'campaign' | 'werbeagentur' | 'support'
     taskId         — Node-ID / Campaign-ID (falls anwendbar)
     startMonthFull — Startmonat (fractional, für Progress-Berechnung)
     duration       — Dauer in Monaten (für Progress-Bar)
     hasProgress    — true wenn Progress-Bar angezeigt werden soll
     isDone         — true = Pending Celebration (klickbar zum Feiern)
     pcIdx          — Index in state.pendingCelebrations (nur bei isDone)
*/
(function (RT) {
  'use strict';

  function nodeLabel(nodeId) {
    if (RT.techtree && RT.techtree.getNode) {
      var n = RT.techtree.getNode(nodeId);
      if (n && n.name) return n.name;
    }
    return nodeId;
  }

  function nodeIcon(nodeId) {
    if (RT.techtree && RT.techtree.getNode) {
      var n = RT.techtree.getNode(nodeId);
      if (n && n.icon) return n.icon;
    }
    return '🔬';
  }

  function nodeMonths(nodeId) {
    if (RT.techtree && RT.techtree.getNode) {
      var n = RT.techtree.getNode(nodeId);
      if (n && n.months) return n.months;
    }
    return 1;
  }

  function campaignDef(type) {
    if (RT.marketing && RT.marketing.CAMPAIGNS) {
      for (var i = 0; i < RT.marketing.CAMPAIGNS.length; i++) {
        if (RT.marketing.CAMPAIGNS[i].id === type || RT.marketing.CAMPAIGNS[i].type === type) {
          return RT.marketing.CAMPAIGNS[i];
        }
      }
    }
    if (RT.communitycenter && RT.communitycenter.CC_ACTIONS) {
      for (var j = 0; j < RT.communitycenter.CC_ACTIONS.length; j++) {
        if (RT.communitycenter.CC_ACTIONS[j].id === type) {
          return RT.communitycenter.CC_ACTIONS[j];
        }
      }
    }
    return null;
  }

  function campaignLabel(camp) {
    var def = campaignDef(camp.type);
    if (def && def.name) return def.name;
    if (camp.name) return camp.name;
    return camp.type || 'Kampagne';
  }

  function campaignIcon(camp) {
    var def = campaignDef(camp.type);
    if (def && def.icon) return def.icon;
    return '📣';
  }

  function campaignDuration(camp) {
    var def = campaignDef(camp.type);
    return (def && def.duration) || 1;
  }

  function list() {
    var s   = RT.state.get();
    var out = [];

    // 1) Techtree-Nodes in progress
    var tt = s.techtree || {};
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var e = tt[nid];
      if (e && typeof e === 'object' && e.status === 'in_progress') {
        var w = e.workers || 1;
        for (var wi = 0; wi < w; wi++) {
          out.push({
            label:          nodeLabel(nid),
            icon:           nodeIcon(nid),
            taskType:       'techtree',
            taskId:         nid,
            startMonthFull: e.startMonthFull,
            duration:       nodeMonths(nid),
            hasProgress:    true,
            isDone:         false
          });
        }
      }
    }

    // 2) Pending Celebrations (klickbar zum Abschließen)
    var pcs = s.pendingCelebrations || [];
    for (var pi = 0; pi < pcs.length; pi++) {
      var pc = pcs[pi];
      if (typeof pc !== 'object') continue;
      var pcW = pc.workers || 0;
      var pcSlots = Math.max(1, pcW);
      var pcLbl, pcIcon;
      if (pc.kind === 'campaign') {
        pcLbl  = campaignLabel({ type: pc.campaignType }) + ' · Klicken!';
        pcIcon = campaignIcon({ type: pc.campaignType });
      } else if (pc.kind === 'support_restart') {
        pcLbl  = 'Support-Neustart · Klicken!';
        pcIcon = '💬';
      } else {
        pcLbl  = nodeLabel(pc.nodeId) + ' · Klicken!';
        pcIcon = nodeIcon(pc.nodeId);
      }
      for (var pcJ = 0; pcJ < pcSlots; pcJ++) {
        out.push({
          label:       pcLbl,
          icon:        pcIcon,
          taskType:    'pending',
          taskId:      pc.nodeId || pc.campaignId || null,
          hasProgress: false,
          isDone:      true,
          pcIdx:       pi
        });
      }
    }

    // 3) Metadaten pending activation (belegt visuell einen Slot, obwohl es kein pending-celebration ist)
    if (s.metadatenPendingActivation && !s.metadatenActive) {
      out.push({
        label:       'Metadaten · Aktivieren!',
        icon:        '🗄️',
        taskType:    'metadaten',
        hasProgress: false,
        isDone:      true
      });
    }

    // 4) Laufende Kampagnen
    var camps = s.campaigns || [];
    for (var ci = 0; ci < camps.length; ci++) {
      var c = camps[ci];
      if (c.phase !== 'running') continue;
      var cW = c.workers || 0;
      for (var cj = 0; cj < cW; cj++) {
        out.push({
          label:          campaignLabel(c),
          icon:           campaignIcon(c),
          taskType:       'campaign',
          taskId:         c.id,
          startMonthFull: c.startMonthFull,
          duration:       campaignDuration(c),
          hasProgress:    true,
          isDone:         false
        });
      }
    }

    // 5) Werbeagentur-Worker (permanent, kein Fortschritt)
    var waW = (s.werbeagentur && s.werbeagentur.workers) || 0;
    for (var wj = 0; wj < waW; wj++) {
      out.push({ label: 'Werbeagentur', icon: '📢', taskType: 'werbeagentur', hasProgress: false, isDone: false });
    }

    // 6) Support-Programm (permanent)
    if (s.supportProgram && s.supportProgram.active) {
      var spW = s.supportProgram.workers || 0;
      for (var sj = 0; sj < spW; sj++) {
        out.push({ label: 'User-Support', icon: '💬', taskType: 'support', hasProgress: false, isDone: false });
      }
    }

    return out;
  }

  function capacity() {
    if (RT.team) return RT.team.getSlotCapacity();
    var s = RT.state.get();
    return (s.resources && s.resources.workers && s.resources.workers.capacity) || 0;
  }

  function used() { return list().length; }
  function free() { return Math.max(0, capacity() - used()); }
  function canAllocate(n) { return free() >= (n || 1); }

  RT.slots = {
    list:        list,
    capacity:    capacity,
    used:        used,
    free:        free,
    canAllocate: canAllocate
  };
})(window.RT);
