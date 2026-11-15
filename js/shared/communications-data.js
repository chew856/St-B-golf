/* Communications data: the announcements seed.
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/communications.js, which reads these helpers from Club.shared.communications. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;
  const AUTHOR = { name: 'The St. Boniface team', role: 'St. Boniface Golf Club' };

  /* ---------------- Audiences ---------------- */
  function reachable(m) { return m.status !== 'resigned' && m.status !== 'suspended'; }
  function audiences() {
    const tiers = S.all('membershipTiers').map(function (t) { return { key: 'tier:' + t.id, label: t.name + ' tier' }; });
    return [{ key: 'all', label: 'All members' }].concat(tiers, [{ key: 'golf', label: 'Golf members' }, { key: 'board', label: 'Board & committees' }, { key: 'staff', label: 'Staff' }]);
  }
  function audienceLabel(key) { const a = audiences().find(function (x) { return x.key === key; }); return a ? a.label : key; }
  function recipientCount(key) {
    if (key === 'staff') return S.all('staff').filter(function (s) { return s.status !== 'inactive' && s.status !== 'terminated'; }).length;
    const ms = S.all('members').filter(reachable);
    if (key === 'all') return ms.length;
    if (key === 'golf') return ms.filter(function (m) { const t = Club.members.tier(m); return t ? !!t.golf : m.tierId !== 'tier_social'; }).length;
    if (key === 'board') return ms.filter(function (m) { return (m.tags || []).some(function (t) { return t === 'Board' || t === 'Committee'; }); }).length;
    if (key.indexOf('tier:') === 0) { const id = key.slice(5); return ms.filter(function (m) { return m.tierId === id; }).length; }
    return 0;
  }

  /* ---------------- Seed ---------------- */
  S.seed('announcements', function () {
    R.reseed(4040);
    const at = function (days, hh, mm) { const d = Club.fmt.toDate(Club.date.fromToday(days)); d.setHours(hh, mm || 0, 0, 0); return d.toISOString(); };
    const CC = 'Craig Campbell';
    const rows = [
      [-58, 'Greens aeration: course closed Monday and Tuesday', 'all', ['Email', 'App'], 'Dear {first_name},\n\nThe course will be closed on Monday and Tuesday for greens aeration and topdressing. The short game practice facility and the Gallery Taphouse & Grill remain open.\n\nThank you for your patience.', 'sent', 9, CC],
      [-52, 'Club championship entries are now open', 'golf', ['Email', 'App'], 'Dear {first_name},\n\nEntries for the **club championship** are now open in the Golf Shop. Please see the Golf Shop for the format, dates and entry details.\n\nGood luck to everyone playing.', 'sent', 10],
      [-45, 'Friday night pizza is on at the Gallery', 'all', ['Email', 'App'], 'Dear {first_name},\n\nOur famous Friday night pizza menu is on this week at the Gallery Taphouse & Grill. Grab a table overlooking the 18th hole and try the house feature tap.', 'sent', 16],
      [-38, 'Frost delay procedure for the fall', 'golf', ['SMS', 'App'], 'As the mornings cool, frost delays will be announced by text first thing. Tee times shift in order and the Golf Shop will confirm your new time.', 'sent', 18, CC],
      [-31, 'Please welcome our newest members', 'all', ['Email'], 'Dear {first_name},\n\nPlease join us in welcoming six new members to St. Boniface Golf Club this month. Say hello on the course or upstairs at the Gallery.\n\nThinking of bringing a friend into the club? First-time members receive our new member bonus.', 'sent', 11],
      [-26, 'Your monthly statement is ready', 'all', ['Email'], 'Dear {first_name},\n\nYour monthly statement is available at the club office and in the member portal. Yearly dues can be paid in instalments until August. Members on pre-authorized debit need take no action.', 'sent', 8],
      [-21, 'Ladies league windup: pairings and tee times', 'tier:tier_full', ['Email', 'App'], 'Pairings for the ladies league windup are posted in the locker room. Shotgun start at 9:00 AM, with lunch at the Gallery Taphouse & Grill to follow.', 'sent', 7],
      [-15, 'Board summary: fall meeting', 'board', ['Email'], 'Members of the Board and committees,\n\nThe minutes of this month’s meeting are attached for your review. Please send any corrections to the club office before the next meeting.', 'sent', 17],
      [-10, 'This week’s features at the Gallery', 'all', ['Email', 'App'], 'Dear {first_name},\n\nNew weekly features created by Executive Chef Ian Wong are on the board at the Gallery Taphouse & Grill this week, along with our 2026 menu favourites like the Smashburger and the St. B Crunch Wrap.', 'sent', 12],
      [-6, 'Frost delay this morning', 'golf', ['SMS', 'App'], 'Frost on the course this morning. First tee time moved back until the frost lifts and later times shifted in order. Breakfast is on at the Gallery.', 'sent', 6, CC],
      [-2, 'Holiday party season staffing', 'staff', ['Email'], 'Team,\n\nThe holiday schedule is posted in the staff room. Please submit any time off requests by Friday so we can confirm cover for holiday parties and weddings in the Banquet Hall.', 'sent', 14],
      [-1, 'Fall golf: playing out the season', 'golf', ['Email', 'App'], 'Dear {first_name},\n\nThe course remains open for fall golf, weather permitting. The closing date for the season will be announced here and in the Golf Shop. Thank you for a wonderful season at St. B.', 'sent', 15, CC],
      [2, 'Book your holiday party at St. Boniface', 'all', ['Email', 'App'], 'Dear {first_name},\n\nPlanning a holiday party, staff celebration or family gathering? Our Banquet Hall seats up to 220 guests, with all-inclusive packages and complimentary parking.\n\nCall the club office at 204-233-2497 or visit stbonifaceevents.com to check dates.', 'scheduled', 9],
      [5, '2027 membership: dues in instalments', 'all', ['Email', 'App'], 'Dear {first_name},\n\nBecoming a member of St. Boniface Golf Club is now more affordable than ever. Yearly dues can be paid in instalments from sign-up until August, and first-time members receive our new member bonus.\n\nPlease share this with friends who have been thinking about joining.', 'scheduled', 10],
      [0, 'Holiday hours at the Gallery Taphouse & Grill', 'all', ['Email'], 'Dear {first_name},\n\nOur holiday hours for the Gallery Taphouse & Grill will be posted here soon. Breakfast, lunch and dinner continue daily.', 'draft', 0],
      [0, 'Season closing and winter notes', 'golf', ['Email', 'App'], 'Dear {first_name},\n\nThe course is now closed for the season. Thank you for a great year on the course. Club storage and lockers remain available. See you in the spring.', 'draft', 0, CC]
    ];
    return rows.map(function (r, i) {
      const n = recipientCount(r[2]);
      const smsOnly = r[3].indexOf('Email') < 0;
      const openRate = smsOnly ? 0.86 + R.rand() * 0.1 : r[2] === 'board' || r[2] === 'staff' ? 0.78 + R.rand() * 0.16 : 0.46 + R.rand() * 0.3;
      const clickRate = Math.min(openRate * 0.6, 0.05 + R.rand() * 0.22);
      const sent = r[5] === 'sent';
      return {
        id: 'ann_' + String(i + 1).padStart(2, '0'), title: r[1], body: r[4], audience: audienceLabel(r[2]), audienceKey: r[2], channels: r[3], status: r[5],
        scheduledFor: r[5] === 'scheduled' ? at(r[0], r[6], 0) : null, sentAt: sent ? at(r[0], r[6], R.pick([0, 15, 30, 45])) : null,
        author: r[7] || AUTHOR.name, recipients: sent ? n : 0,
        opens: sent ? Math.round(n * openRate) : 0, clicks: sent ? Math.round(n * clickRate) : 0,
        updatedAt: sent ? at(r[0], r[6]) : at(-R.int(0, 3), 15)
      };
    });
  });

  /* For the staff page (js/modules/communications.js) */
  Club.shared = Club.shared || {};
  Club.shared.communications = { AUTHOR, audiences, audienceLabel, recipientCount };
})();
