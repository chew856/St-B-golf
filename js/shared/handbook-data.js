/* Club.handbook: the club's Membership Handbook as editable data, shared by all three pages.

   SOURCE: the club's own "2025 Membership Handbook" (19-page PDF, St. Boniface Golf Club, dated April 19, 2025):
   https://s3.amazonaws.com/data.gallusgolf.com/files/1790/0f5bafd83c104da8b23e005a6d8e8cee.pdf
   The text below is the handbook's text. Only obvious typos were fixed ("STATMENT", "my result", "bear mid drifts",
   "emails", "Woman's shirts", "privilege's", "39 of August 1st", "maximum of (3)", "Marshall", a missing full stop);
   nothing was added. Headings are in sentence case and the PDF's underlines are shown as bold.

   Data
   - collection 'handbook': one document per section { id, group, title, body, order, updatedAt }. Seeded once per
     browser from SEED with Club.store.seed (the $seeded guard keeps a handbook the club emptied empty). Staff edit it
     in Settings > Handbook (js/modules/settings-handbook.js); members read it in the portal (js/portal/handbook.js).
   - body is simple markup: a blank line starts a new paragraph; inside a paragraph each line is a new line; a line
     starting "- " is a bullet, "1. " a numbered item, "### " a small heading; **words** are bold; web addresses link.
   - group is one of GROUPS (stored in English). order sorts sections inside a group.
   - Club.handbook.hours: the handbook's hours of operation as structured data (Office, Pro Shop, Gallery Taphouse &
     Grill, Beer Cart) for the portal's Club page and the public site. Fixed to the 2025 handbook: editing the
     "Hours of operation" section changes the handbook text only.

   French: js/i18n/fr-portal.js (block "Handbook") sets Club.handbookFr, a translation of the 2025 text keyed by section
   id. A section is shown in French only while its title and body are still the 2025 text; a section staff edited or
   added shows in English to French readers until it is translated. The English handbook prevails. */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const S = Club.store;
  if (!S) return;

  /* An open book, for menus (added here so js/core/icons.js stays as it is). */
  if (Club.iconPaths && !Club.iconPaths.book) Club.iconPaths.book = '<path d="M12 6.5c-2-1.6-4.7-2-7.5-1.6v13c2.8-.4 5.5 0 7.5 1.6 2-1.6 4.7-2 7.5-1.6v-13c-2.8-.4-5.5 0-7.5 1.6z"/><path d="M12 6.5v13"/>';

  const COLL = 'handbook';
  const META = {
    title: '2025 Membership Handbook',
    year: 2025,
    issued: '2025-04-19',   /* the date on the club's PDF */
    pdfUrl: 'https://s3.amazonaws.com/data.gallusgolf.com/files/1790/0f5bafd83c104da8b23e005a6d8e8cee.pdf'
  };
  const GROUPS = ['Welcome', 'Administration', 'Codes of conduct', 'General information', 'Tee time booking', 'Golf course policies', 'Clubhouse policies'];

  /* [id, group, title, body] in handbook order */
  const SEED_ROWS = [
    ['welcome', 'Welcome', 'Welcome to St. B',
      '**Welcome to “The Friendly Club”, we are glad you are here!**\n\n' +
      'This information is provided to help you, your family, and guests enjoy St. Boniface Golf Club to the fullest, and help you feel at home right away. Included in this handbook are Club policies, Club rules and procedures pertinent to the golf course and clubhouse. Please contact our Director of Golf Operations, Director of Club Operations, or Administration if you have a question, concern or an issue that is not addressed here. Your input is valuable.\n\n' +
      'Watch your email for weekly updates which will detail upcoming events and keep everyone up to date with club activities and information. We encourage you to take the time to read this information as it will help keep you informed.\n\n' +
      'Note: The information contained in this booklet is general in nature and remains at all times subject to interpretation according to the by-laws of St. Boniface Golf Club, and the by-laws of St. Boniface Golf Club Limited.'],
    ['mission', 'Welcome', 'Club mission statement',
      'The mission of the St. Boniface Golf Club, as a recreation facility, is to provide an atmosphere of social enjoyment for all ages. This is to include a competitive, yet affordable golf course, as well as comfortable amenities in the Clubhouse and Pro-shop. This will be accomplished through:\n\n' +
      '- Continual review and improvement of value-added service on the golf course, clubhouse and pro-shop.\n' +
      '- Providing the membership and its guests with a sense of belonging, relaxation, and attention to their needs.\n' +
      '- Maintaining a fiscally responsible plan to ensure value for its shareholders, members, and guests.\n' +
      '- Performing as a good corporate citizen, while adhering to environmental issues and legislative requirements.\n' +
      '- Providing employees with the opportunity to grow, develop their skills and share in the success of the club.'],

    ['board', 'Administration', 'Board of directors',
      '- **President:** Michelle Miyai\n' +
      '- **Vice-President:** Duane Budnick\n' +
      '- **Treasurer:** Kevin Collins\n' +
      '- **Past President:** Ryan Potter\n' +
      '- **Secretary:** Dom Allard\n' +
      '- **Ladies Representative:** Julie Bihun'],
    ['directors-at-large', 'Administration', 'Directors at large',
      '- Greg Yakubovich\n- Dominic Courcelles\n- Maria Sabourin\n- Brian Nazar\n- Thanh Nguyen\n- Julien Lavergne'],
    ['management', 'Administration', 'Management team',
      '- **Director of Golf/Head Pro:** Steve Wood\n' +
      '- **Director of Clubhouse:** Carly Dalmyn\n' +
      '- **Accountant:** Leslie Filopoulos\n' +
      '- **Executive Chef:** Ian Wong\n' +
      '- **Events Coordinator:** Morgan Verwymeren\n' +
      '- **Golf Course Superintendent:** Craig Campbell\n' +
      '- **Assistant Superintendent:** Richard Wright'],

    ['dress-code', 'Codes of conduct', 'Dress code',
      'Clubhouse dress code is to be observed at all times:\n\n' +
      '**Appropriate golf attire is required for all players. It is expected that members will advise their guests of our dress requirements.**\n\n' +
      '1. Only soft golf spikes are allowed on the course or in the clubhouse. Spikes must be cleaned before entering the clubhouse.\n' +
      '2. Shorts - not shorter than six (6) inches above the knee.\n' +
      '3. Shirts must be worn at all times.\n' +
      '4. Men’s shirts must have sleeves and collar.\n' +
      '5. Women’s shirts must have sleeves or a collar.\n' +
      '6. No athletic shorts, sweat pants, cut-off jean shorts, muscle shirts, halter tops, tank tops, and hockey or football jerseys.\n' +
      '7. Women may wear tasteful tank tops and halter tops inside the clubhouse (no bare midriffs).\n\n' +
      'The Head Pro, Pro Shop staff and The Marshal are empowered to enforce the dress code. Players not complying will be asked to change or will not be allowed to tee off.'],
    ['intoxication', 'Codes of conduct', 'Intoxication',
      'By virtue of the Liquor Control Act, the Club is prohibited from selling or serving liquor to any person who is or appears to be intoxicated.'],
    ['alcohol', 'Codes of conduct', 'The responsible service of alcohol',
      '**The law dictates employees; management and the Club are legally obligated to:**\n\n' +
      '- Prevent members and guests from reaching the point of intoxication.\n' +
      '- Withhold service of alcoholic beverages from any member or guest who appears intoxicated or displays any sign of intoxication.\n' +
      '- Deny service of alcohol to minors (under the age of 18).\n\n' +
      'Alcoholic beverages will only be served in compliance with LGA regulations. No person is permitted to bring alcoholic beverages on to the golf course, in the parking lot or in to the clubhouse. Tailgating is not permitted. Only alcoholic beverages purchased from the Club may be consumed on the golf course, clubhouse, upper deck, lower patio or Ceremony Site. Personal coolers are not permitted on the golf course.\n\n' +
      '**Failure to adhere to these conditions may result in the loss of or suspension of the Club’s Liquor License.**'],
    ['smoking', 'Codes of conduct', 'Smoking',
      'According to the City by-law there is no smoking allowed anywhere inside the Clubhouse, on the upper deck, lower patio or any outdoor licensed facility. There is a designated smoking area, beneath the upper deck on the south side of the clubhouse.'],
    ['profanity', 'Codes of conduct', 'Profanity',
      'Use of profanity, excessively loud or inappropriate behavior will not be tolerated, and will be subject to disciplinary action.\n\n' +
      'St. Boniface prides itself on being recognized as the “Friendly Club” and has a commitment to ensure all members and guests including juniors feel welcome and comfortable at all times in the clubhouse and on the golf course.\n\n' +
      'Members are responsible for their conduct, and that of family and guests, and are required to ensure conduct is appropriate. Inappropriate behavior will be subject to disciplinary action.'],

    ['hours', 'General information', 'Hours of operation',
      '### Office\nMonday to Friday: 8:30 am – 5:00 pm\n\n' +
      '### Pro Shop\nMonday to Sunday: 6:00 am – 10:00 pm*\n\n' +
      '*as dictated by business and hours of daylight. Inclement weather or lack of business during non-peak times may cause a deviation from the hours of operation as published.\n\n' +
      '### Gallery Taphouse & Grill\nMonday to Friday: 9:00 am – Last Call*\nSaturday & Sunday: 7:00 am – Last Call*\n\n' +
      '*Last Call as dictated by business & hours of daylight. Inclement weather or lack of business during non-peak times may cause a deviation from the hours of operation as published.\n\n' +
      '### Beer Cart\nMonday to Friday: 10:00 am – dusk\nWeekends & holidays: 9:00 am – dusk\n\n' +
      '*as dictated by business and hours of daylight. Inclement weather or lack of business during non-peak times may cause a deviation from the hours of operation as published.'],
    ['adult-categories', 'General information', 'Adult membership categories and play allowances',
      '### Eagle; Eagle 60+; Eagle INT\n' +
      '- No restrictions on tee times.\n' +
      '- 15-day advance booking privileges.\n\n' +
      'INTERMEDIATE ~ Age 19 to 39 (ID required) 60+ (ID required)\n\n' +
      '### Birdie; Birdie INT\n' +
      '- Weekdays - before 7:30am, between 10:30am-4:00pm, after 5:30pm.\n' +
      '- Weekends - play Saturday, Sunday & Holidays after 10:30 am (subject to availability).\n' +
      '- When a holiday falls on a weekday, that day will be treated as a weekend day.\n' +
      '- 13-day advance booking privileges.\n\n' +
      'INTERMEDIATE ~ Age 19 to 39 as of August 1st, 2025 (ID required).\n\n' +
      '### Social Membership\n' +
      '- 5 golf vouchers included\n' +
      '- Attendance as Member to Opening Mixer held in April and Closing Social in October.\n' +
      '- 10% member discount in Gallery and Proshop\n' +
      '- Retain Membership status\n\n' +
      '### Club House Membership\n' +
      '- Attendance as Member to Opening Mixer held in April and Closing Social in October.\n' +
      '- 10% member discount in Gallery and Proshop\n' +
      '- Retain Membership status'],
    ['youth-categories', 'General information', 'Youth membership categories and play allowances',
      '### Young Adult\n' +
      '- Weekdays - between 10:30am-4:00pm, after 5:30pm.\n' +
      '- Weekends - play Saturday, Sunday & Holidays after 10:30am (subject to availability).\n' +
      '- When a holiday falls on a weekday, that day will be treated as a weekend day.\n' +
      '- 8-day advance booking privileges.\n\n' +
      '### Junior (JR)\n' +
      '- Must meet MGA requirements: 18 & under by August 31, 2025.\n' +
      '- Weekdays - between 10:30am-4:00pm, after 5:30pm.\n' +
      '- Weekends - play Saturday, Sunday & Holidays after 11:00am (subject to availability).\n' +
      '- When a holiday falls on a weekday, that day will be treated as a weekend day.\n' +
      '- 8-day advance booking privileges.'],

    ['booking', 'Tee time booking', 'Tee time booking procedures',
      '**All tee times can be booked via the online booking system https://stbonifacegolfclub.clubhouseonline-e3.net/login.aspx or through the Proshop; Monday-Sunday 7:00-9:00pm.**\n\n' +
      'Weekdays – Monday to Friday – Online/daily bookings (self-bookings)\n\n' +
      'Weekends – Saturday, Sunday & Holidays - ballot system\nEnter ballots 13-15 days in advance\nExample: on Friday you can enter ballots to play for the 2 weeks ahead for a Saturday.\n\n' +
      'Draw will be made as follows:\nSaturday draw (12:00pm) will be done on the Sunday following the cut-off (13 days prior)\nSunday draw (12:00pm) will be done on the Monday following the cut-off (13 days prior)'],
    ['ballot-rules', 'Tee time booking', 'Ballot rules',
      '- Enter ballots at www.stbonifacegolfclub.com and proceed to book a tee time.\n' +
      '- A member account number and password is required to be set up first\n' +
      '- Phone in and online tee times will still be accepted after the ballot draw.\n' +
      '- All membership categories may use the ballot system.\n\n' +
      '*If you have any questions regarding the ballot system or setting up your account and password, please ask the Head Pro or the Pro Shop staff for assistance.'],

    ['member-guest', 'Golf course policies', 'Member guest policy',
      'One guest per member is allowed during the following PRIME times:\n\n' +
      '### Friday - All day\n' +
      '- Fridays will be exclusively for member enjoyment.\n' +
      '- No green fee players will be permitted on Fridays except as a guest of a member.\n' +
      '- No tournaments or outside golf events will be booked on a Friday.\n\n' +
      '### Saturday, Sunday, and Holidays - 6:00am–11:00am\n\n' +
      'Maximum 3 guests per member during all other tee times.'],
    ['fivesome', 'Golf course policies', 'Fivesome policy',
      'Groups of five are permitted at the discretion of the Pro Shop, with a maximum of 2 fivesomes per hour, to accommodate the single golfer looking for a game. Play, in groups in excess of five players (sixsomes or larger) will not be permitted under any circumstance. Violation of this policy will result in a seven (7) day suspension of all club privileges, both on the course and in the clubhouse.'],
    ['pace-of-play', 'Golf course policies', 'Pace of play policy',
      'To maintain speed of play, the Proshop staff, and course marshals have been instructed to enforce the following rules:\n\n' +
      '- Be ready to hit when it is your turn.\n' +
      '- Avoid taking excessive practice swings prior to hitting.\n' +
      '- Keep pace with the group ahead of you.\n' +
      '- Pace of play should not take more than 13 minutes per hole.'],
    ['handicaps', 'Golf course policies', 'Handicaps policy',
      'A Golf Canada handicap is available to all members and comes with your membership. In order to keep your handicap, please see the Pro Shop staff and they will help you get established. All scores are to be posted. The system is designed to determine players potential by using only the lowest eight (8) of the last twenty (20) scores entered.'],
    ['practice', 'Golf course policies', 'Practice facility',
      'Members may practice only at: the putting green east of the Proshop entrance, the practice facility to the South of the 18th fairway, and at the practice pitching range, bunker and putting green located between the 1st fairway and the 17th green.'],
    ['shotgun', 'Golf course policies', 'Shotgun starts',
      'Members’ shotgun starts may be scheduled at the start of the season, the end of the season, and periodically to accommodate tournaments, which provide essential revenue for the Club. Normal tee-time booking procedures are suspended for these events. The shotgun starts are generally scheduled for 7:30am for members and 12:00noon for tournaments. To participate, register with the Pro Shop or book online. Plan to arrive about a half-hour prior to tee-off to allow time to get to your designated hole. The Pro Shop will post the list detailing groups and the hole on which they will start.'],
    ['club-storage', 'Golf course policies', 'Club storage',
      'Club storage and cleaning is provided for all members and included in their Dues. Storage is available for a fee to Corporate Members. Members are reminded that members are NOT permitted in the back shop and that storage is at their own risk. The Club does not assume any responsibility for lost, stolen or damaged articles.\n' +
      '*Clubs must be removed from storage by October 31 of that season.'],
    ['power-carts', 'Golf course policies', 'Power carts',
      'Power carts are available for rent from the Pro Shop. Use of privately owned power carts is not allowed. *Golf power carts are not permitted on tee boxes or greens.\n\n' +
      'Pull Carts are supplied at the Pro Shop for all Members. Privately owned Pull carts are permitted on the golf course. *Golf pull carts are not permitted on tee boxes or greens.'],
    ['cart-paths', 'Golf course policies', 'Cart paths',
      'Golfers using power carts are requested to stay on the cart paths or the rough whenever possible. On par three (3) holes, please use the cart path only. The Pro Shop and/or Marshal will inform golfers of the rule of the day for power carts.'],
    ['tournaments', 'Golf course policies', 'Tournament information',
      'A tournament is any event requiring six (6) or more consecutive tee times or all tee boxes at a designated time (shotgun).\n\n' +
      'There will be a maximum of three (3) tournaments per week during the months of May, June, September, and October.\n\n' +
      'There will be a maximum of two (2) tournaments per week during the months of July and August.'],

    ['refund', 'Clubhouse policies', 'Refund policy',
      'There is a $50.00 administrative fee for all refunds of golf dues. Membership refund requests must be received in writing before May 31st, even if no golf has been played; a $50.00 administrative fee for all refunds will apply. No refunds after May 31st. The Board of Directors will review requests after May 31st on an individual basis (a medical note may be required or proof of moving out of province). A two (2) month credit toward the next season may be granted.'],
    ['fb-assessment', 'Clubhouse policies', 'Food & beverage assessment',
      'All adult members are required to pre-pay a Food and Beverage Assessment of $375.00 each season (April 1st to October 31st). The Assessment will be set up as a credit on your account; and all food and beverage purchases made in the clubhouse or on the golf course refreshment carts will work on a declining balance against the credit. This Assessment is non-transferable. Gratuities are NOT applied against the Assessment.'],
    ['credit', 'Clubhouse policies', 'Credit policy',
      'Charging privileges will only be extended to members in good standing with the Clubhouse and Pro Shop. Each member is issued a membership card indicating a Club account number for charging purposes. This card must be presented upon request prior to charging a purchase. Members may be denied charging privileges if they are unable to produce their current membership card.'],
    ['accounts-receivable', 'Clubhouse policies', 'Accounts receivable policy',
      '**Payment of Account:**\n' +
      '- a valid credit card is required for all members with account privileges; and will only be utilized if accounts are in arrears 60+ days.\n' +
      '- Account statements are emailed in the first week of each month\n' +
      '- The account balance is due upon receipt of the monthly statement; to be paid in full no later than the last of the month.\n\n' +
      '**Any member who fails to pay any indebtedness to the Club will be subject to the following actions:**\n' +
      '- **60 days** from statement date- suspension of account privileges.\n' +
      '- **90 days** from statement date- Suspension of tee time booking and playing privileges.\n' +
      '- **120 days** from statement date-Suspension of ALL privileges; including clubhouse, locker room and amenities.\n' +
      '- **In arrears at Year end**- Accounts may be registered for collections and Share forfeited. And value from the share will be applied against the outstanding balance of the account. The member will continue to be liable for any outstanding balance greater than the share amount.\n' +
      '- **Perpetual Delinquency**- will result in no charging privileges extended indefinitely after the F&B assessment is depleted.'],
    ['time-payment', 'Clubhouse policies', 'Time payment policy',
      'Membership Time Payment privileges are offered to members in good standing. An administration fee of $50 applies to all Time Payment applications.\n\n' +
      '- A valid credit card is required to be accepted as a Time Payment applicant; said credit card will be charged if a monthly payment is missed.\n' +
      '- Payments are due on the 15th of each month.\n' +
      '- Payments are accepted by: EFT, cash, cheque, debit or credit card.\n' +
      '- Credit card payments are subject to a 1.5% processing fee\n' +
      '- All membership dues must be paid in full by Aug 15th of the membership year.\n\n' +
      'Any member who fails to pay Time Payments on-time and the credit card provided does not clear the balance due, the following actions will apply:\n\n' +
      '- **In arrears 30 days**- Suspension of all tee time booking and golf privileges.\n' +
      '- **Perpetual Delinquency**- will result in no Time Payment privileges extended in the future.'],
    ['handicap-parking', 'Clubhouse policies', 'Handicap parking',
      'Several handicap spots are designated along the fence facing the 18th green. Vehicles must display the appropriate designated handicap identification. If your vehicle has a handicap decal, and you are not transporting someone with a physical handicap, you are requested not to park in those areas designated solely for persons with a physical handicap.'],
    ['lockers', 'Clubhouse policies', 'Lockers',
      'Lockers are assigned to members for use during the golf season. Lockers must be emptied, and locks removed no later than October 31st to facilitate winter maintenance and cleaning. *one locker per member.\n\n' +
      'Guest lockers are available on a limited basis for day use. Inquire at the office for availability.'],
    ['showers-towels', 'Clubhouse policies', 'Showers & towels',
      'Showers and towels are available in each locker room for member and guest use. Green bath towels are to remain in the locker rooms.'],
    ['pets', 'Clubhouse policies', 'Pets',
      'Pets are not permitted on the golf course or in the clubhouse; unless otherwise approved by a Director of Operation.']
  ];
  const SEED = SEED_ROWS.map(function (r, i) { return { id: 'hb_' + r[0], group: r[1], title: r[2], body: r[3], order: (i + 1) * 10, updatedAt: null }; });
  const SEED_BY_ID = {};
  SEED.forEach(function (s) { SEED_BY_ID[s.id] = s; });

  /* Hours of operation (handbook, General information). open/close are 24-hour 'HH:MM'; until is used when a day
     ends at last call or dusk; star marks the lines the handbook footnotes with "*". */
  const HOURS = [
    { id: 'office', venue: 'Office', icon: 'billing', rows: [{ days: 'Monday to Friday', open: '08:30', close: '17:00' }], note: '' },
    { id: 'proshop', venue: 'Pro Shop', icon: 'flag', rows: [{ days: 'Monday to Sunday', open: '06:00', close: '22:00', star: true }],
      note: '*as dictated by business and hours of daylight. Inclement weather or lack of business during non-peak times may cause a deviation from the hours of operation as published.' },
    { id: 'gallery', venue: 'Gallery Taphouse & Grill', icon: 'dining', rows: [{ days: 'Monday to Friday', open: '09:00', until: 'last call', star: true }, { days: 'Saturday & Sunday', open: '07:00', until: 'last call', star: true }],
      note: '*Last Call as dictated by business & hours of daylight. Inclement weather or lack of business during non-peak times may cause a deviation from the hours of operation as published.' },
    { id: 'beercart', venue: 'Beer Cart', icon: 'cart', rows: [{ days: 'Monday to Friday', open: '10:00', until: 'dusk' }, { days: 'Weekends & holidays', open: '09:00', until: 'dusk' }],
      note: '*as dictated by business and hours of daylight. Inclement weather or lack of business during non-peak times may cause a deviation from the hours of operation as published.' }
  ];
  /** '08:30' -> '8:30 AM' (English; the French dictionaries turn the whole line into French). */
  function clock(t) { const p = String(t).split(':'), h = +p[0]; return (h % 12 || 12) + ':' + (p[1] || '00') + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  /** One hours line: '8:30 AM to 5:00 PM', '9:00 AM to last call*', '10:00 AM to dusk'. */
  function range(row) { return clock(row.open) + ' to ' + (row.close ? clock(row.close) : row.until) + (row.star ? '*' : ''); }

  /* ---------------- Seed (once per browser) ---------------- */
  S.seed(COLL, function () { return SEED.map(function (s) { return Object.assign({}, s); }); });

  /* ---------------- Markup ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]; }); }
  /** Inline markup on already-escaped text: **bold** and web addresses. */
  function inline(t) {
    return t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+?)([.,;:)]?(?=\s|$|<))/g, function (m, pre, url, tail) {
        const href = /^www\./.test(url) ? 'https://' + url : url;
        return pre + '<a href="' + href + '" target="_blank" rel="noopener">' + url + '</a>' + tail;
      });
  }
  /** Simple markup -> HTML. Unknown or stray characters are shown as typed (everything is escaped first). */
  function html(body) {
    const out = [];
    String(body || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).forEach(function (block) {
      const lines = block.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); });
      let para = [], list = null;
      const flushPara = function () { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
      const flushList = function () { if (list) { out.push(list.tag === 'ol' ? '<ol' + (list.start > 1 ? ' start="' + list.start + '"' : '') + '>' + list.items.join('') + '</ol>' : '<ul>' + list.items.join('') + '</ul>'); list = null; } };
      lines.forEach(function (raw) {
        const l = raw.trim();
        let m;
        if ((m = /^#{2,4}\s+(.+)$/.exec(l))) { flushPara(); flushList(); out.push('<h4>' + inline(esc(m[1])) + '</h4>'); return; }
        if ((m = /^[-•·]\s*(.+)$/.exec(l)) && !/^-\d/.test(l)) {
          flushPara(); if (list && list.tag !== 'ul') flushList();
          if (!list) list = { tag: 'ul', items: [] };
          list.items.push('<li>' + inline(esc(m[1])) + '</li>'); return;
        }
        if ((m = /^(\d{1,3})[.)]\s+(.+)$/.exec(l))) {
          flushPara(); if (list && list.tag !== 'ol') flushList();
          if (!list) list = { tag: 'ol', start: +m[1], items: [] };
          list.items.push('<li>' + inline(esc(m[2])) + '</li>'); return;
        }
        flushList(); para.push(inline(esc(l)));
      });
      flushPara(); flushList();
    });
    return out.join('');
  }
  /** Markup -> plain text (search and one-line summaries). */
  function plain(body) {
    return String(body || '').replace(/\*\*/g, '').replace(/^\s*(#{2,4}|[-•·]|\d{1,3}[.)])\s+/gm, '').replace(/\s+/g, ' ').trim();
  }

  /* ---------------- Reading ---------------- */
  function groupIndex(g) { const i = GROUPS.indexOf(g); return i < 0 ? GROUPS.length : i; }
  function sort(a, b) { return groupIndex(a.group) - groupIndex(b.group) || (+a.order || 0) - (+b.order || 0) || String(a.title).localeCompare(String(b.title)); }
  function list() { return S.all(COLL).filter(Boolean).slice().sort(sort); }
  function get(id) { return S.find(COLL, id) || S.find(COLL, 'hb_' + id); }
  /** The 2025 text of a section, or null for a section the club added. */
  function original(id) { return SEED_BY_ID[id] || null; }
  /** True while a section's title and body are still the 2025 text (its order and group may have moved). */
  function isOriginal(sec) { const o = sec && original(sec.id); return !!o && o.title === sec.title && o.body === sec.body; }
  function french() { return !!(Club.i18n && Club.i18n.lang && Club.i18n.lang() === 'fr'); }
  /** What a reader sees: { title, body, lang: 'en'|'fr', untranslated } (French only for unedited sections). */
  function view(sec) {
    const fr = french() && Club.handbookFr && Club.handbookFr.sections ? Club.handbookFr.sections[String(sec.id).replace(/^hb_/, '')] : null;
    if (fr && isOriginal(sec)) return { title: fr.title, body: fr.body, lang: 'fr', untranslated: false };
    return { title: sec.title, body: sec.body, lang: 'en', untranslated: french() };
  }
  function groupLabel(g) { return french() && Club.handbookFr && Club.handbookFr.groups && Club.handbookFr.groups[g] || g; }
  /** Newest edit, else the date on the PDF ('YYYY-MM-DD'). */
  function lastUpdated() {
    const ts = S.all(COLL).map(function (s) { return s && s.updatedAt; }).filter(Boolean).sort();
    return ts.length ? ts[ts.length - 1].slice(0, 10) : META.issued;
  }
  /** Back to the 2025 text (every section; added ones are removed). Callers wrap this in Undo. */
  function restore() { S.replace(COLL, SEED.map(function (s) { return Object.assign({}, s); })); }

  Club.handbook = {
    COLL: COLL, META: META, GROUPS: GROUPS, SEED: SEED,
    hours: HOURS, clock: clock, range: range,
    html: html, plain: plain, esc: esc,
    list: list, get: get, original: original, isOriginal: isOriginal, view: view, groupLabel: groupLabel,
    lastUpdated: lastUpdated, restore: restore, french: french
  };
})();
