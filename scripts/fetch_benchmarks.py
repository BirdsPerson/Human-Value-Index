#!/usr/bin/env python3
"""Fetch free, external "how the real world values this person" benchmarks for
every figure in src/figures.js and write docs/methodology/benchmarks.json.

Sources (all free, no keys):
  - Wikipedia/Wikidata API        -> enwiki title, page id, Wikidata QID, sitelink count
  - Wikimedia Pageviews REST API  -> enwiki user pageviews, last 12 full months
  - Pantheon (api.pantheon.world) -> Historical Popularity Index (HPI), rank, L
  - Wikidata claims               -> awards received (P166) count, Time 100 / Person of the Year
  - Wikipedia list articles       -> Time 100 of the Century; Hart's The 100 (top 10 only, public)
  - YouGov Ratings public pages   -> US fame % / popularity % / disliked % / neutral %

Usage: python3 scripts/fetch_benchmarks.py   (takes ~3 minutes; polite delays)
"""
import datetime as dt
import html
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "methodology" / "benchmarks.json"
UA = "HVIBenchmarkBot/0.1 (human-value-index research script; https://human-value-index.netlify.app)"
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

# Figure name in src/figures.js -> English Wikipedia title (only where they differ).
TITLE_OVERRIDES = {
    "JFK": "John F. Kennedy",
    "Putin": "Vladimir Putin",
    "Prince": "Prince (musician)",
    "Queen Elizabeth II": "Elizabeth II",
    "Princess Diana": "Diana, Princess of Wales",
    "Kim Jong-un": "Kim Jong Un",
    "Nikola Jokic": "Nikola Jokić",
    "Joe Jackson": "Joe Jackson (manager)",
    "Mansa Musa": "Mansa Musa",
    "Cleopatra": "Cleopatra",
    "Madonna": "Madonna",
}
# YouGov US entity slugs where the plain name doesn't resolve.
YOUGOV_OVERRIDES = {
    "JFK": "John_F_Kennedy",
    "Martin Luther King Jr.": "Martin_Luther_King_Jr",
    "Putin": "Vladimir_Putin",
    "Queen Elizabeth II": "Queen_Elizabeth_II",
    "Princess Diana": "Princess_Diana",
    "Prince": "Prince",
    "Kim Jong-un": "Kim_Jong_Un",
    "Nikola Jokic": "Nikola_Jokic",
    "Pelé": "Pele",
}
# Hart, "The 100" (1992 ed.): only the top 10 is public (Wikipedia omits the rest
# for copyright). Figures of ours in that top 10:
HART_TOP10 = {"Isaac Newton": 2, "Albert Einstein": 10}

PV_START, PV_END = "20250901", "20260831"  # 12 full months ending before today


def get(url, ua=UA, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429:
                time.sleep(5 * (i + 1))
                continue
            if i == retries - 1:
                raise
        except Exception:
            if i == retries - 1:
                raise
        time.sleep(2 * (i + 1))
    return None


def jget(url, **kw):
    t = get(url, **kw)
    return json.loads(t) if t else None


def figure_names():
    src = (ROOT / "src" / "figures.js").read_text()
    names = re.findall(r'name: "([^"]+)"', src)
    seen, out = set(), []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


def resolve_wiki(titles):
    """title -> {title, pageid, qid}, following redirects."""
    res = {}
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        q = urllib.parse.urlencode({
            "action": "query", "titles": "|".join(chunk), "prop": "pageprops",
            "redirects": 1, "format": "json", "formatversion": 2})
        d = jget("https://en.wikipedia.org/w/api.php?" + q)
        mapping = {t: t for t in chunk}
        for n in d["query"].get("normalized", []):
            for k, v in mapping.items():
                if v == n["from"]:
                    mapping[k] = n["to"]
        for r in d["query"].get("redirects", []):
            for k, v in mapping.items():
                if v == r["from"]:
                    mapping[k] = r["to"]
        pages = {p["title"]: p for p in d["query"]["pages"]}
        for k, v in mapping.items():
            p = pages.get(v)
            if p and "missing" not in p:
                res[k] = {"title": p["title"], "pageid": p["pageid"],
                          "qid": p.get("pageprops", {}).get("wikibase_item")}
        time.sleep(1)
    return res


def pageviews(title):
    art = urllib.parse.quote(title.replace(" ", "_"), safe="")
    d = jget(f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/"
             f"all-access/user/{art}/monthly/{PV_START}/{PV_END}")
    if not d:
        return None
    return sum(i["views"] for i in d.get("items", []))


def wikidata(qids):
    out = {}
    for i in range(0, len(qids), 45):
        chunk = qids[i:i + 45]
        q = urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(chunk),
                                    "props": "sitelinks|claims", "format": "json"})
        d = jget("https://www.wikidata.org/w/api.php?" + q)
        for qid, e in d["entities"].items():
            awards = e.get("claims", {}).get("P166", [])
            award_ids = [a["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for a in awards]
            out[qid] = {
                "sitelinks": sum(1 for k in e.get("sitelinks", {}) if k.endswith("wiki") and k not in ("commonswiki", "specieswiki", "metawiki", "wikidatawiki")),
                "awards_count": len(set(a for a in award_ids if a)),
                "time_100_wikidata": "Q604370" in award_ids,
                "time_person_of_year_wikidata": "Q207826" in award_ids,
            }
        time.sleep(1)
    return out


def pantheon(pageids):
    ids = ",".join(str(p) for p in pageids)
    rows = jget(f"https://api.pantheon.world/person_ranks?id=in.({ids})"
                "&select=id,name,hpi,rank,l,occupation,occupation_rank,non_en_page_views,coefficient_of_variation")
    return {r["id"]: r for r in rows or []}


def pantheon_total():
    # count of ranked people, for turning rank into a percentile
    req = urllib.request.Request("https://api.pantheon.world/person_ranks?select=id&limit=1",
                                 headers={"User-Agent": UA, "Prefer": "count=exact"})
    with urllib.request.urlopen(req, timeout=40) as r:
        cr = r.headers.get("Content-Range", "")
    return int(cr.split("/")[-1]) if "/" in cr and cr.split("/")[-1].isdigit() else None


def linked_titles(page):
    """All article titles linked from a Wikipedia page (redirects resolved later by title match)."""
    titles, cont = set(), {}
    while True:
        q = {"action": "query", "titles": page, "prop": "links", "plnamespace": 0,
             "pllimit": "max", "redirects": 1, "format": "json", "formatversion": 2, **cont}
        d = jget("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(q))
        for p in d["query"]["pages"]:
            for l in p.get("links", []):
                titles.add(l["title"])
        if "continue" not in d:
            return titles
        cont = d["continue"]
        time.sleep(0.5)


def linked_qids(lang, title):
    """Wikidata QIDs of every article linked from a Wikipedia page."""
    out, cont = set(), {}
    while True:
        q = {"action": "query", "generator": "links", "titles": title, "gplnamespace": 0,
             "gpllimit": "max", "prop": "pageprops", "ppprop": "wikibase_item", "redirects": 1,
             "format": "json", "formatversion": 2, **cont}
        d = jget(f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode(q))
        for p in d.get("query", {}).get("pages", []):
            qid = p.get("pageprops", {}).get("wikibase_item")
            if qid:
                out.add(qid)
        if "continue" not in d:
            return out
        cont = d["continue"]
        time.sleep(0.5)


def time100_century_qids():
    """English Wikipedia omits the full 1999 list; the Russian and Japanese articles carry it.
    Intersect the two link sets so incidental links (e.g. prose mentions) drop out."""
    d = jget("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q2584203&props=sitelinks&format=json")
    sl = d["entities"]["Q2584203"]["sitelinks"]
    return linked_qids("ru", sl["ruwiki"]["title"]) & linked_qids("ja", sl["jawiki"]["title"])


def person_of_the_year():
    """enwiki title/alias -> [years] for Time Person of the Year winners (main table only:
    rows with a scope=row header; shortlists in collapsible lists are excluded, except the
    2025 'Architects of AI' spotlight, which names the individuals it represents)."""
    q = urllib.parse.urlencode({"action": "parse", "page": "Time Person of the Year",
                                "prop": "wikitext", "format": "json", "formatversion": 2})
    t = jget("https://en.wikipedia.org/w/api.php?" + q)["parse"]["wikitext"]
    t = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", "", t, flags=re.S)
    t = re.sub(r"\{\{sortname\|([^|}]+)\|([^|}]+)[^}]*\}\}", r"[[\1 \2]]", t)
    winners = {}
    for row in re.split(r"\n\|-", t):
        m = re.search(r"\n\|\s*(\d{4})\s*\n", "\n" + row)
        if not m or 'scope="row"' not in row:
            continue
        parts = re.split(r"Collapsible list|did not release a shortlist", row)
        core = parts[0]
        if len(parts) > 1 and "spotlights the following people" in parts[1]:
            core += parts[1]
        for link in re.findall(r"\[\[([^\]|#]+)", core):
            winners.setdefault(link.strip(), []).append(int(m.group(1)))
    return winners


YG_API = "https://api-test.yougov.com/public-data/v5/us/search/entity/"
YG_TYPES = {"all-time-people": "d0010482-3fec-11e9-b94b-233359fd2f20",
            "historical-figures": "1daaf13c-cb6c-11ea-8947-7bc7ee38143c"}


def norm(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]", "", s).strip()


def yougov_index():
    """Crawl YouGov's public US people rankings (20 per page, the API maximum)."""
    idx = {}
    for label, vt in YG_TYPES.items():
        off, hits = 0, 1
        while off < hits:
            d = jget(f"{YG_API}?virtual_type={vt}&limit=20&offset={off}", ua=BROWSER_UA)
            hits = d.get("hits", 0)
            for x in d.get("data", []):
                idx.setdefault(norm(x["name"]), {**x, "_list": label})
            if not d.get("data"):
                break
            off += 20
            time.sleep(0.25)
    return idx


def yougov(name):
    slug = YOUGOV_OVERRIDES.get(name, name.replace(" ", "_"))
    url = f"https://yougov.com/en-us/topics/public_figure/{urllib.parse.quote(slug)}"
    s = get(url, ua=BROWSER_UA)
    if not s:
        return None
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", s, flags=re.S)
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))
    def pct(pattern):
        m = re.search(pattern, t)
        return int(m.group(1)) if m else None
    fame = pct(r"Fame is defined by the % of people who have heard of this topic\. (\d+)%")
    pop = pct(r"Popularity is the % of people who have a positive opinion on a topic\. (\d+)%")
    dis = pct(r"Disliked by (\d+)%")
    neu = pct(r"Neutral (\d+)%")
    if fame is None and pop is None:
        return None
    return {"fame_pct": fame, "popularity_pct": pop, "disliked_pct": dis, "neutral_pct": neu,
            "liked_share_of_aware": round(pop / fame, 3) if pop is not None and fame else None,
            "url": url}


def main():
    names = figure_names()
    print(f"{len(names)} figures", file=sys.stderr)
    wiki = resolve_wiki([TITLE_OVERRIDES.get(n, n) for n in names])
    wiki = {n: wiki.get(TITLE_OVERRIDES.get(n, n)) for n in names}

    wd = wikidata([w["qid"] for w in wiki.values() if w and w.get("qid")])
    pan = pantheon([w["pageid"] for w in wiki.values() if w])
    pan_total = pantheon_total()
    time100_century = time100_century_qids()
    yg_idx = yougov_index()
    poty = person_of_the_year()

    figures = {}
    for n in names:
        w = wiki.get(n)
        rec = {"enwiki_title": w["title"] if w else None, "wikidata_qid": w.get("qid") if w else None}
        if w:
            rec["pageviews_12mo"] = pageviews(w["title"])
            time.sleep(0.3)
            d = wd.get(w.get("qid"), {})
            rec["wikipedia_language_editions"] = d.get("sitelinks")
            rec["wikidata_awards_count"] = d.get("awards_count")
            p = pan.get(w["pageid"])
            if p:
                rec["pantheon"] = {
                    "hpi": round(p["hpi"], 2) if p.get("hpi") is not None else None,
                    "rank": p.get("rank"),
                    "rank_percentile": round(100 * (1 - p["rank"] / pan_total), 3) if pan_total and p.get("rank") else None,
                    "language_editions_L": p.get("l"),
                    "non_en_pageviews": p.get("non_en_page_views"),
                    "occupation": p.get("occupation"),
                    "occupation_rank": p.get("occupation_rank"),
                }
            else:
                rec["pantheon"] = None
            rec["time_100_of_the_century"] = w.get("qid") in time100_century
            yrs = sorted(set(poty.get(w["title"], []) + poty.get(n, [])))
            rec["time_person_of_the_year"] = yrs or None
            if n == "Albert Einstein":
                rec["time_person_of_the_century"] = 1999
            rec["time_100_annual_wikidata"] = d.get("time_100_wikidata", False)
        rec["hart_100_rank"] = HART_TOP10.get(n)
        yg = yougov(n)
        time.sleep(1.0)
        hit = None
        for cand in (n, w["title"].split(" (")[0] if w else n, YOUGOV_OVERRIDES.get(n, "").replace("_", " ")):
            hit = hit or (yg_idx.get(norm(cand)) if cand else None)
        if hit:
            yg = yg or {"url": "https://yougov.com/en-us/topics/public_figure/" + hit["url"]}
            yg.setdefault("fame_pct", hit["rating_data"].get("fame"))
            yg.setdefault("popularity_pct", hit["rating_data"].get("popularity"))
            if yg.get("fame_pct") is None:
                yg["fame_pct"] = hit["rating_data"].get("fame")
            if yg.get("popularity_pct") is None:
                yg["popularity_pct"] = hit["rating_data"].get("popularity")
            yg["all_time_people_rank"] = hit["rating_data"].get("index") if hit["_list"] == "all-time-people" else None
            yg["ranking_list"] = hit["_list"]
        rec["yougov_us"] = yg
        figures[n] = rec
        print(f"  {n}: pv={rec.get('pageviews_12mo')} hpi={(rec.get('pantheon') or {}).get('hpi')} "
              f"yg={(yg or {}).get('popularity_pct')}", file=sys.stderr)

    def cov(fn):
        return sum(1 for r in figures.values() if fn(r))
    coverage = {
        "figures": len(names),
        "enwiki_resolved": cov(lambda r: r.get("enwiki_title")),
        "pageviews_12mo": cov(lambda r: r.get("pageviews_12mo")),
        "wikipedia_language_editions": cov(lambda r: r.get("wikipedia_language_editions")),
        "pantheon_hpi": cov(lambda r: (r.get("pantheon") or {}).get("hpi") is not None),
        "yougov_us": cov(lambda r: r.get("yougov_us")),
        "time_100_of_the_century": cov(lambda r: r.get("time_100_of_the_century")),
        "time_person_of_the_year": cov(lambda r: r.get("time_person_of_the_year")),
        "hart_100_top10": cov(lambda r: r.get("hart_100_rank")),
        "scm_warmth_competence": 0,
    }
    doc = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "generator": "scripts/fetch_benchmarks.py",
        "purpose": "External calibration targets for HVI scores: how the real world values each figure. "
                   "Fame and popularity, not virtue. Use to test whether the rubric's balance tracks reality, "
                   "never as a score input for private users.",
        "sources": {
            "pageviews_12mo": f"Wikimedia Pageviews REST API, en.wikipedia, all-access, agent=user, monthly {PV_START}-{PV_END}. Fame/attention proxy; spikes on deaths, scandals, anniversaries.",
            "wikipedia_language_editions": "Wikidata sitelinks (wiki projects only). Breadth of cross-cultural notability; slow-moving.",
            "wikidata_awards_count": "Distinct 'award received' (P166) values on Wikidata. Institutional recognition proxy; editing coverage is uneven.",
            "pantheon": "MIT Pantheon 2.0 (pantheon.world), api.pantheon.world/person_ranks. HPI combines language editions, pageview age-adjustment and non-English views. rank_percentile is against all ranked people. Covers people with 15+ language editions.",
            "time_100_of_the_century": "Time 100: The Most Important People of the Century (1999). English Wikipedia omits the full list, so membership = linked from BOTH the Russian and Japanese Wikipedia articles (QID match), which carry it.",
            "time_person_of_the_year": "Years named (alone or as a named member of a group choice, e.g. Mandela in 1993's 'Peacemakers', Swift in 2017's 'Silence Breakers', Altman in 2025's 'Architects of AI'), parsed from the winner rows of Wikipedia 'Time Person of the Year'. Shortlists excluded.",
            "time_100_annual_wikidata": "Wikidata P166=Q604370 (Time 100). Sparse; false means 'not recorded', not 'never listed'.",
            "hart_100_rank": "Michael H. Hart, The 100 (1992 ed.). Only ranks 1-10 are public; null means 'not in top 10 or unknown'.",
            "yougov_us": "YouGov Ratings public pages (yougov.com/en-us/topics/public_figure/...), US panel, rolling quarterly, plus the public rankings API (api-test.yougov.com/public-data/v5, 'all-time-people' and 'historical-figures' lists; all_time_people_rank = YouGov's own popularity rank). fame = % heard of; popularity = % positive; liked_share_of_aware = popularity/fame. Viewing is free; check YouGov's public-data license before republishing numbers.",
            "scm_warmth_competence": "No free dataset found with per-person warmth/competence ratings for named public figures; SCM studies rate groups, not individuals.",
        },
        "coverage": coverage,
        "figures": figures,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(coverage, indent=2), file=sys.stderr)


if __name__ == "__main__":
    main()
