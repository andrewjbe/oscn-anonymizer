// ============================================================
// A javascript tool that censors names and case numbers on an OSCN case page so you can screenshot it safely.
//
// How to install (Firefox): go to Bookmarks > Manage Bookmarks > Add Bookmark. Name it "Redact OSCN", and paste the whole
//      contents of redact-oscn.bookmarklet.txt as its URL. (That file is basically just this squished down to one line, see the commented out part at the bottom.)
// How to install (Chrome/Safari/Etc.): install Firefox > see above. Just kidding lol, you can probably do something similar, you will have to google it yourself though.
//
// How to use: 1. Open the OSCN case page. 2. Click the bookmark, pick what to censor in the menu panel. 3. Click apply. 4. Screenshot
// You can refresh the page to make it look normal again.
//
// How this works:
//   - First it identifies names to censor. The menu panel lets you pick "All names" / "Parties only" / "Defendants only". You can also
//     exclude specific names and add other names it can't find on its own (any format)
//   - Then it gives each person a censored name (JOHN A DOE, JUDGE A, ATTORNEY B, etc.), so you can still tell who is who
//   - replaces each name everywhere on the page, in every order OSCN uses ("SMITH, JOHN QUINCY", "JOHN Q. SMITH",
//     "John Q. Smith", "JOHN SMITH ROBLES"), and any one of their names left on its own (e.g. "MR. SMITH" -> "MR. DOE A", "JUDGE SMITH" -> "JUDGE A").
//   - It will also by default censor case numbers (CF-2019-1234 -> CF-20XX-XXXX) and attorneys' bar numbers too
// PLEASE NOTE that this doesn't cover:
//   - typos / other weird spellings
//   - some random one-off names in the docket events
//   - the browser's address bar, which still shows the real case number (don't screenshot that)
//   - knowing OSCN, probably lots of other stuff I didn't see in my pretty minimal testing of this
// ============================================================
(() => {
    const FIRST_NAMES = ['JOHN', 'JANE', 'JIM', 'JACK', 'JILL', 'JOE', 'JUNE', 'JAKE', 'JEAN', 'JAY', 'JOAN', 'ANDREW'];
    const NOT_A_PERSON = /agency|state of oklahoma|sheriff|police|department|^judge|judge( \(|$)|admin|unassigned|docket|clerk|defender|county|commission|ex rel|united states|misdemeanor|felony/i;
    const COMPANY = /\b(inc|llc|l\.l\.c|n\.?a|co|corp|ltd|lp|pc|bank|association|apartments)\b|&/i;
    // words found next to names in docket text, that are never treated as part of a name
    const STOP = `THE OF TO FOR AND IS IN ON AT BY AS WITH FROM BEFORE THRU PER NO NOT HAS WAS WILL SHALL
        COURT DISTRICT SPECIAL ASSOCIATE CHIEF CIVIL SMALL CLAIMS TRAFFIC JUDGE REFEREE BENCH DKT CF CASE STATE FED
        ORDERS? ORDERED FINDS ASSIGNED REASSIGNMENT SCRIPT DISPOSED DISPOSITION FEES? GENERAL APPOINTED WAIVED WITHDRAW ALLOWED
        PRESENT PRESENTED APPEARS APPEARED BEHALF SUBSTITUTED REQUEST REVIEWED BASED YESTERDAY DOWNTOWN
        DEFT DEFENDANT COUNSEL ATTORNEY ASSISTANT DA ADA PD PUBLIC PROSECUTION COUNCIL OFFICE REPORTER SUPERVISION
        VICTIM SERVICES UNIT MAIL RECEIPT CERTIFIED SUMMONS RETURNED SERVED NON POSTING COPY PROCESS SERVER
        AOC MIS BANK BOND PLEA DRUG FUND INSPECTION NOTIFICATION PAYMENT PLAN ACTION FAILURE FORM MOVES CHANGED SIGNED EXCUSED
        FOLLOWING SUPERVISED TURNED DID OKLA RE ST OR ARE PRO SE`.split(/\s+/).join('|');
    const STOP_WORD = new RegExp('^(?:' + STOP + ')$', 'i');
    const WORD = `(?!(?:${STOP})\\b)[A-Z][A-Z']+(?:-[A-Z']+)?`; // a word that could be part of a name
    const SUFFIXES = ['JR', 'SR', 'II', 'III', 'IV'];
    const TITLES = { Judges: 'JUDGE', Attorneys: 'ATTORNEY' }; // judges and attorneys get a title instead of a fake name
    const kind = group => TITLES[group] || 'PARTY'; // defendants and other parties are one kind of person
    const tidy = s => (s || '').replace(/\s+/g, ' ').trim(); // OSCN pads names with non-breaking spaces
    // stop words are skipped, unless the name was typed into the menu panel ("Mary Case")
    const nameWords = (name, typed) => name.toUpperCase().split(/[^A-Z']+/).filter(w => w.length > 1 && (typed || !STOP_WORD.test(w)) && !SUFFIXES.includes(w));

    // Every word of every identified name points to its owner(s). One regex finds each run of those words (with initials,
    // suffixes and , / & between them) and the whole run becomes one placeholder, whatever order it's in:
    // "SMITH, JOHN Q." / "JOHN QUINCY SMITH" / "SMITH/JOHN" / "JUDGE SMITH" / "JOHN & JANE SMITH"
    const buildFix = (people, opts) => {
        const owners = new Map(), spellings = new Set(), counts = {};
        people.forEach(({ name, role, typed }) => {
            const i = counts[kind(role)] = (counts[kind(role)] || 0) + 1;
            const letter = (i > 26 ? String.fromCharCode(64 + Math.floor((i - 1) / 26)) : '') + String.fromCharCode(65 + (i - 1) % 26); // A-Z, AA-AZ...
            const title = TITLES[role];
            const fake = FIRST_NAMES[(i - 1) % FIRST_NAMES.length] + ' ' + letter;
            const short = (title || 'DOE') + ' ' + letter;
            const p = { role, short, full: title ? short : fake + ' DOE', comma: title ? short : 'DOE, ' + fake,
                initials: (name.toUpperCase().match(/[A-Z]+/g) || []).map(w => w[0]) };
            for (const w of name.split(/[^A-Za-z']+/)) if (nameWords(w, typed).length) {
                const W = w.toUpperCase();
                if (!owners.get(W)?.includes(p)) owners.set(W, [...(owners.get(W) || []), p]);
                spellings.add(W).add(w[0] + W.slice(1)); // and a lowercase first letter only if it's written that way: "butch"
            }
        });
        // any case after the first letter: "MCCLENDON", "McClendon", "Mcclendon"
        const words = [...spellings].sort((a, b) => b.length - a.length).map(w => w[0] + w.slice(1).replace(/[A-Z]/g, c => `[${c}${c.toLowerCase()}]`)).join('|');
        const piece = `(?:${words}|${SUFFIXES.join('|')}|Jr|Sr|[A-Z]\\.?(?![A-Za-z'/]))`, sep = `[\\s,/&"-]+`;
        // a run can end before a possessive: "JACKSON'S" -> "DOE A'S"
        const run = new RegExp(`(?<![A-Za-z'])((?:JUDGE|Judge|ATTY|ATTORNEY|COUNSEL|A\\.?D\\.?A\\.?|DA):?\\s+)?((?:(?<!\\b[A-Za-z]/)[A-Za-z](?:\\.\\s*|${sep}))*(?:${words})(?:${sep}${piece})*)(?![A-Za-z])(?!'(?![Ss]?(?![A-Za-z])))`, 'g');
        const replaceRun = (_, title = '', text) => {
            // split the run into one segment per person: a name word that isn't theirs starts the next one
            const segs = [];
            for (const [, w, gap] of text.matchAll(/([A-Za-z][A-Za-z']*\.?)([^A-Za-z']*)/g)) {
                const W = w.toUpperCase(), own = owners.get(W), seg = segs.at(-1);
                const shared = seg?.who?.filter(p => !own || own.includes(p)); // who this word could still belong to
                if (shared?.length) { // another word, initial or suffix of the same person
                    seg.comma ||= own && /,/.test(seg.gap); // "SMITH, JOHN" -> "DOE, JOHN A"
                    Object.assign(seg, { who: shared, gap }).words.push(W);
                } else if (!own) segs.push({ words: [W], gap, raw: w + gap }); // an initial, before we know whose
                else { // a new person, taking the initials right before it if they're theirs ("r. COX" yes, "v. MILLER" no)
                    const lead = [];
                    while (segs.at(-1) && !segs.at(-1).who && own.some(p => p.initials.includes(segs.at(-1).words[0][0]))) lead.unshift(segs.pop());
                    const fit = own.filter(p => lead.every(s => p.initials.includes(s.words[0][0]))); // "G. JONES" -> GLENN JONES
                    segs.push({ who: fit.length ? fit : own, words: [...lead.map(s => s.words[0]), W], gap });
                }
            }
            // "JUDGE SMITH" -> "JUDGE A", not "JUDGE JUDGE A"
            const role = title && (/JUDGE/i.test(title) ? 'Judges' : 'Attorneys'), titled = segs[0]?.who?.find(p => p.role === role);
            if (titled) title = '';
            return title + segs.map((seg, k) => {
                if (!seg.who) return seg.raw; // stray initials, left as they were
                const p = (!k && titled) || seg.who[0];
                // "JOHN SMITH" -> "JOHN A DOE", "SMITH, JOHN" -> "DOE, JOHN A", a lone "SMITH" or "JOHN" -> "DOE A"
                return (seg.words.filter(w => owners.get(w)?.includes(p)).length > 1 ? (seg.comma ? p.comma : p.full) : p.short) + seg.gap;
            }).join('');
        };
        const fixes = owners.size ? [[run, replaceRun]] : []; // with no names the run regex would match empty strings
        if (opts.caseNumbers) fixes.push([/\b([A-Z]{2,4})-\d{2,4}-\d{1,8}\b/gi, '$1-20XX-XXXX']); // CF-2019-1234
        if (opts.barNumbers) fixes.push([/((?:Bar\s*#|OBA\s*#?)\s*)\d+/gi, '$1XXXXX']); // "Bar #1234", "OBA# 1234"
        return s => fixes.reduce((text, [re, to]) => text.replace(re, to), s);
    };

    // Everyone the page names (parties, attorneys, judges, people in the docket text), grouped for the menu panel
    const findNames = () => {
        const found = []; // { group, name, words }
        const within = (a, b) => a.every(w => b.includes(w));
        const add = (group, raw) => {
            raw = tidy(tidy(raw).replace(/["*]|\(.*?\)|'S?$/gi, '')); // Forrest "Butch", HALL'S, ROE, MARY (REAL NAME UNKNOWN)
            if (NOT_A_PERSON.test(raw)) return;
            const name = raw.replace(/[,:]$/, ''), words = nameWords(name);
            if (!/^[A-Z][A-Z .,'-]+$/i.test(name) || name.split(/[ ,.:-]+/).some(t => STOP_WORD.test(t)) || !words.length) return;
            // one person if one name's words are all in the other's ("HALL" / "RUSSELL D. HALL" / "Hall, Russell D."), keeping the fuller name
            const prev = found.find(f => kind(f.group) === kind(group) && (within(f.words, words) || within(words, f.words)));
            if (!prev) found.push({ group, name, words });
            else Object.assign(prev, words.length > prev.words.length && { name, words }, group === 'Defendants' && { group }); // a defendant stays one
        };
        // parties: people are listed "LAST, FIRST"; companies have no comma, or end in ", INC" / ", LLC" etc.
        document.querySelectorAll('.parties_party').forEach(el => {
            const type = tidy(el.querySelector('.parties_type')?.textContent), name = tidy(el.querySelector('.parties_partyname')?.textContent).split(/ (dba|d\/b\/a)\b/i)[0];
            if (!NOT_A_PERSON.test(type) && name.includes(',') && !COMPANY.test(name)) // "DOE, JOHN, PARENT/NEXT FRIEND OF JANE DOE, A MINOR" is two people
                name.split(/,? \S*NEXT FRIEND OF|, A MINOR/i).forEach(n => add(/defendant/i.test(type) ? 'Defendants' : 'Other parties', n));
        });
        document.querySelectorAll('h2.attorneys + table tbody tr').forEach(tr =>
            add('Attorneys', (tr.querySelector('td')?.childNodes[0]?.textContent || '').split('(')[0]));
        add('Judges', document.querySelector('table')?.innerText.match(/Judge:\s*([^\n]+)/)?.[1]); // case header
        document.querySelectorAll('table.events_table tbody tr').forEach(tr => add('Judges', tr.querySelectorAll('td')[2]?.textContent));
        // names that only show up in docket text, after a trigger like "JUDGE" or "POSTED BY".
        // A space in these patterns means one or more spaces/tabs on the same line
        const END = `(?= *(?:[-:,./;)]|$)| (?:${STOP})\\b)`; // names end at punctuation or a stop word
        const NAME = `(?:[A-Z]\\. ?)?${WORD}(?:(?: [A-Z]\\.?)? ${WORD})?${END}`;  // "HOLDEN" / "J. LAYTON" / "KIMBERLY C. BAILEY"
        const FULL = `(?:${WORD}|[A-Z]\\.)(?: [A-Z]\\.?)? ${WORD}${END}`;         // first name or initial, and last name: "JANA HARRINGTON"
        const LAST_FIRST = `${WORD}(?: ${WORD})?, ${WORD}(?: [A-Z]\\.?| ${WORD})?(?![A-Z])`;           // "DEASON, DONALD L." / "LUDI LEITCH, DEBORRAH"
        const text = document.body.innerText;
        [
            ['Judges', `JUDGE:? (${LAST_FIRST}|${NAME})`],                 // "JUDGE DEASON, DONALD L.", "JUDGE HALL:", "JUDGE: RUSSELL HALL"
            ['Judges', `^(${LAST_FIRST}):`],                               // minutes headed "LUDI LEITCH, DEBORRAH:"
            ['Judges', `^(${NAME}) , JUDGE:`],                             // "MILLIE OTEY , JUDGE: CASE DISPOSED"
            ['Attorneys', `\\b(?:COUNSEL|ATTY|ATTORNEY|A\\.D\\.A\\.|REPRESENTED BY|ST(?:ATE)?(?: PRESENT)? BY) (${NAME})`], // "WITH COUNSEL HOLDEN", "STATE REPRESENTED BY KEVIN KELLER"
            ['Others in docket text', `(?:POSTED BY|AGENT:|PROFESSIONAL:) *(${LAST_FIRST})`],  // bonds: "POSTED BY MILLS, AMBER"
            ['Others in docket text', `(?:SERVED(?: ON)?:|SIGNED BY|REPORTER) (${FULL})`],     // "SERVED: JENNIFER LOWELL", "COURT REPORTER JANA HARRINGTON"
        ].forEach(([group, re]) => {
            re = re.replace(/ (?![*+?])/g, ' +').replace(/ /g, '[ \\t\\u00a0]');
            [...text.matchAll(new RegExp(re, 'gm'))].forEach(m => add(group, m[1]));
        });
        const groups = { Defendants: [], 'Other parties': [], Attorneys: [], Judges: [], 'Others in docket text': [] };
        found.forEach(({ group, name }) => groups[group].push(name));
        return groups;
    };

    const applyFix = fix => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) walker.currentNode.nodeValue = fix(walker.currentNode.nodeValue);
        document.querySelectorAll('input, textarea').forEach(el => { el.value = fix(el.value); });
        document.title = fix(document.title);
    };

    // --- the menu panel ---
    const groups = findNames();
    const MODES = { 'All names': Object.keys(groups), 'Parties only': ['Defendants', 'Other parties'], 'Defendants only': ['Defendants'] };
    const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
    const row = (...kids) => el('label', { style: 'display:block' }, ...kids);
    const panel = el('div', { style: 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#fff;color:#000;border:1px solid #888;'
        + 'border-radius:6px;padding:12px 14px;font:13px/1.4 sans-serif;max-height:85vh;overflow:auto;width:320px;box-shadow:0 4px 16px #0004' });
    const picks = []; // { box, name, role }
    panel.append(el('b', { textContent: 'Redact OSCN' }));
    Object.keys(MODES).forEach((mode, i) => panel.append(row(el('input', { type: 'radio', name: 'redact-mode', checked: i === 0,
        onchange: () => picks.forEach(p => { p.box.checked = MODES[mode].includes(p.role); }) }), ' ' + mode)));
    Object.entries(groups).forEach(([role, names]) => {
        if (names.length) panel.append(el('div', { style: 'margin-top:8px;font-weight:bold', textContent: role }));
        names.forEach(name => {
            const box = el('input', { type: 'checkbox', checked: true });
            picks.push({ box, name, role });
            panel.append(row(box, ' ' + name));
        });
    });
    const extras = el('textarea', { rows: 3, placeholder: 'Other names, one per line (e.g. a victim or whoever posted bond)', style: 'width:100%;margin-top:8px' });
    const caseNumbers = el('input', { type: 'checkbox', checked: true }), barNumbers = el('input', { type: 'checkbox', checked: true });
    const apply = () => {
        const people = picks.filter(p => p.box.checked)
            .concat(extras.value.split('\n').map(tidy).filter(Boolean).map(name => ({ name, role: 'Other parties', typed: true })));
        panel.remove();
        try { applyFix(buildFix(people, { caseNumbers: caseNumbers.checked, barNumbers: barNumbers.checked })); }
        catch (e) { alert('Redact OSCN failed, the page is NOT fully redacted: ' + e.message); }
    };
    panel.append(extras, row(caseNumbers, ' Case numbers'), row(barNumbers, ' Attorney bar numbers'), el('div', { style: 'margin-top:8px' },
        el('button', { textContent: 'Apply', onclick: apply }), ' ', el('button', { textContent: 'Cancel', onclick: () => panel.remove() })));
    document.body.append(panel);
})();

// To regenerate the bookmarklet after editing this file:
//   node -e 'const s=require("fs").readFileSync("redact-oscn.js","utf8");require("fs").writeFileSync("redact-oscn.bookmarklet.txt","javascript:"+encodeURIComponent(s.slice(s.indexOf("(() =>"),s.lastIndexOf("})();")+5)))'
