/* Loaded in member.html and public.html before the shared data files (js/shared/*-data.js), which hold the staff
   modules' seed data and shared helpers (Club.billing etc.). No staff module loads on these pages; this stands in for
   the staff app (Club.register, Club.app) for any code that looks for it. */
(function () {
  window.Club = window.Club || {};
  Club.modules = [];
  Club.register = function (m) { Club.modules.push(m); };
  Club.app = { go: function () {}, render: function () {}, refreshNav: function () {}, modules: Club.modules };
})();
