window.__ModuleLoader__.load({
	id: "@lbryany/dsh-widget",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/style.ts
		/**
		* Card style presets: the user-chosen half of a card's look. The base
		* contract (fragment rules, CSP, size, theme-variable use, the 11px floor,
		* lint) belongs to the plugin and no style can change it; a style only
		* supplies
		*
		* - hard style, injected by the frame shell and therefore deterministic:
		*   values for the frame's `--dsh-viz-*` hooks (one `light-dark()` value
		*   covers both appearances, because the frame's `color-scheme` follows the
		*   host), an optional webfont stylesheet, a small scoped CSS block, and the
		*   chart defaults `dshViz.chartDefaults` applies on top of the tokens;
		* - soft style, a short prose guide (`assets/styles/<id>.md`) the skill
		*   provider appends to the skill body, which overrides only the taste
		*   guidance in `references/design.md`.
		*
		* Every preset leaves the background transparent so the card sits on the
		* host's chat surface. Values were contrast- and colour-vision-checked
		* against the host surfaces (light #ffffff/#f5f6f7, dark #151517/#232324).
		*
		* Pure and DOM-free: the node half reads ids and prose paths, the browser
		* card reads the hard style for the id persisted in each card's meta.
		*
		* @module @lbryany/dsh-widget/style
		*/
		/** Every built-in style id, in settings order; the first is the default. */
		const STYLE_IDS = [
			"whale",
			"editorial",
			"paper",
			"sketch",
			"terminal"
		];
		/** The style a card takes when its meta names none, or one this build lacks. */
		const DEFAULT_STYLE = "whale";
		const SYSTEM_SANS = "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
		/** `light-dark()` shorthand for the tables below. */
		function ld(light, dark) {
			return `light-dark(${light}, ${dark})`;
		}
		/** Six series as `--dsh-viz-series-N` entries. */
		function series(pairs) {
			return Object.fromEntries(pairs.map(([light, dark], i) => [`series-${i + 1}`, ld(light, dark)]));
		}
		const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?";
		/** The built-in styles by id. */
		const STYLES = {
			whale: {
				id: "whale",
				label: "鲸蓝 · Whale (default)",
				vars: {},
				chart: {}
			},
			editorial: {
				id: "editorial",
				label: "报刊 · Editorial",
				vars: {
					"foreground": ld("#1a1a1a", "#f2efe9"),
					"muted-foreground": ld("#5f5f5f", "#a8a39b"),
					"card": ld("rgb(140 110 60 / 6%)", "rgb(255 235 205 / 5%)"),
					"border": ld("rgb(0 0 0 / 12%)", "rgb(255 255 255 / 14%)"),
					"primary": ld("#b24032", "#f07a62"),
					"primary-foreground": ld("#ffffff", "#151517"),
					...series([
						["#b24032", "#f07a62"],
						["#28659d", "#78ade8"],
						["#26826b", "#5eccab"],
						["#a87810", "#e3b04b"],
						["#7a4e8c", "#c395d2"],
						["#6e6259", "#b2a696"]
					]),
					"context": ld("#8a8a8a", "#6f6f6f"),
					"grid": ld("rgb(0 0 0 / 8%)", "rgb(255 255 255 / 9%)"),
					"axis": ld("rgb(26 26 26 / 60%)", "rgb(242 239 233 / 60%)"),
					"font-display": "'Source Serif 4', 'Noto Serif SC', 'Songti SC', serif",
					"font-sans": "'Libre Franklin', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
					"radius": "2px"
				},
				fontHref: `${GOOGLE_FONTS}family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Libre+Franklin:wght@400;500;600&family=Noto+Serif+SC:wght@500;700&display=swap`,
				extraCss: "h1, h2, h3 { font-weight: 600; letter-spacing: -0.005em; }",
				chart: {
					pointRadius: 0,
					valueAxisLine: false
				}
			},
			paper: {
				id: "paper",
				label: "论文 · Paper",
				vars: {
					"foreground": ld("#111111", "#ececec"),
					"muted-foreground": ld("#555555", "#a6a6a6"),
					"card": ld("rgb(0 0 0 / 2.5%)", "rgb(255 255 255 / 4%)"),
					"border": ld("rgb(0 0 0 / 18%)", "rgb(255 255 255 / 18%)"),
					"primary": ld("#0072b2", "#58b6ed"),
					"primary-foreground": ld("#ffffff", "#111111"),
					...series([
						["#0072b2", "#58b6ed"],
						["#d55e00", "#e8743b"],
						["#0c9c67", "#35b67e"],
						["#c774a4", "#da91bd"],
						["#9d7d36", "#e69f00"],
						["#3b3b3b", "#d0d0d0"]
					]),
					"grid": ld("rgb(0 0 0 / 6%)", "rgb(255 255 255 / 7%)"),
					"grid-axes": "none",
					"axis": ld("rgb(17 17 17 / 70%)", "rgb(236 236 236 / 70%)"),
					"line-width": "1.5",
					"font-display": "'STIX Two Text', 'Noto Serif SC', 'Songti SC', serif",
					"font-sans": "'STIX Two Text', 'Noto Serif SC', 'Songti SC', serif",
					"radius": "2px"
				},
				fontHref: `${GOOGLE_FONTS}family=STIX+Two+Text:wght@400;500;600&family=Noto+Serif+SC:wght@400;600&display=swap`,
				chart: {
					pointRadius: 3,
					pointStyles: [
						"circle",
						"triangle",
						"rect",
						"rectRot",
						"crossRot",
						"star"
					],
					dashes: [
						[],
						[6, 3],
						[2, 2],
						[
							8,
							3,
							2,
							3
						]
					]
				}
			},
			sketch: {
				id: "sketch",
				label: "手绘 · Sketch",
				vars: {
					"foreground": ld("#1e1e1e", "#ececec"),
					"muted-foreground": ld("#5c5f66", "#a6a7ab"),
					"card": ld("rgb(250 176 5 / 9%)", "rgb(250 176 5 / 7%)"),
					"border": ld("rgb(30 30 30 / 35%)", "rgb(236 236 236 / 35%)"),
					"primary": ld("#2d71b7", "#74c0fc"),
					"primary-foreground": ld("#ffffff", "#1e1e1e"),
					...series([
						["#2d71b7", "#74c0fc"],
						["#cb1913", "#ff8787"],
						["#36a047", "#91ea91"],
						["#7048e8", "#9775fa"],
						["#e8590c", "#ffa94d"],
						["#108f6c", "#55e6c6"]
					]),
					"grid-axes": "none",
					"axis": ld("rgb(30 30 30 / 60%)", "rgb(236 236 236 / 60%)"),
					"line-width": "2.5",
					"font-display": "'Kalam', 'LXGW WenKai TC', 'Kaiti SC', 'STKaiti', cursive",
					"font-sans": "'Kalam', 'LXGW WenKai TC', 'Kaiti SC', 'STKaiti', cursive",
					"font-mono": "'LXGW WenKai Mono TC', ui-monospace, monospace",
					"font-size-base": "15px",
					"radius": "10px"
				},
				fontHref: `${GOOGLE_FONTS}family=Kalam:wght@400;700&family=LXGW+WenKai+TC:wght@400;700&family=LXGW+WenKai+Mono+TC:wght@400&display=swap`,
				extraCss: `.card { border-width: 1.5px; border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px; }
.viz-stat-value, table { font-family: ${SYSTEM_SANS}; }`,
				chart: {
					tension: .35,
					pointRadius: 0,
					axisWidth: 1.5
				}
			},
			terminal: {
				id: "terminal",
				label: "终端 · Terminal",
				vars: {
					"foreground": ld("#1f2328", "#d6dccf"),
					"muted-foreground": ld("#59636e", "#8f9a8c"),
					"card": ld("rgb(0 0 0 / 3.5%)", "rgb(50 216 135 / 5%)"),
					"border": ld("rgb(0 0 0 / 16%)", "rgb(214 220 207 / 16%)"),
					"primary": ld("#177a46", "#32d887"),
					"primary-foreground": ld("#ffffff", "#0d0f0d"),
					...series([
						["#1e9157", "#32d887"],
						["#8c5e03", "#f2b33d"],
						["#3a757f", "#8ac9d4"],
						["#9b0b9e", "#e07ce0"],
						["#cf222e", "#ff6b6b"],
						["#0a50ae", "#79a8ff"]
					]),
					"grid": ld("rgb(0 0 0 / 10%)", "rgb(214 220 207 / 10%)"),
					"grid-axes": "both",
					"grid-dash": "2 4",
					"line-width": "1.5",
					"font-display": "'JetBrains Mono', 'LXGW WenKai Mono TC', 'Sarasa Mono SC', ui-monospace, 'SF Mono', monospace",
					"font-sans": "'JetBrains Mono', 'LXGW WenKai Mono TC', 'Sarasa Mono SC', ui-monospace, 'SF Mono', monospace",
					"font-mono": "'JetBrains Mono', 'LXGW WenKai Mono TC', 'Sarasa Mono SC', ui-monospace, 'SF Mono', monospace",
					"font-size-base": "13px",
					"radius": "0px"
				},
				fontHref: `${GOOGLE_FONTS}family=JetBrains+Mono:wght@400;500;700&family=LXGW+WenKai+Mono+TC:wght@400;700&display=swap`,
				extraCss: "body { font-variant-numeric: tabular-nums; }",
				chart: {
					tension: 0,
					pointRadius: 2,
					pointStyles: ["rect"]
				}
			}
		};
		/**
		* `globalThis` property the node half sets on every DSH web page it serves —
		* `{ style }`, the configured card style — so the browser half knows the
		* active style before any card in the page has settled.
		*/
		const PAGE_CONFIG_GLOBAL = "__DSH_WIDGET_CONFIG__";
		/**
		* Path of the node half's style-file route on the host's `/api` channel,
		* which the settings page calls (style-files.ts).
		*/
		const STYLE_FILES_PATH = "/api/dsh-widget/style-files";
		/**
		* Narrow a persisted or configured value to a style id. Wire data may come
		* from an older card (no style) or a newer build (an id this one lacks); both
		* render in the default rather than declining the card.
		* @param value - the raw value.
		* @returns a known style id.
		*/
		function styleIdFrom(value) {
			return typeof value === "string" && STYLE_IDS.includes(value) ? value : DEFAULT_STYLE;
		}
		/**
		* Narrow one wire value to a {@link VisualizeMode}.
		* @param value - the raw value.
		* @returns whether it names a known mode.
		*/
		function isVisualizeMode(value) {
			return value === "inline" || value === "wide" || value === "page";
		}
		/**
		* Narrow one persisted `tool/result` meta value to a {@link VisualizeMeta}.
		* Wire data cannot be trusted to match the compiled shape (an older or newer
		* host may have logged it), so a mismatch declines to `undefined` — the caller
		* falls back to the generic presentation instead of throwing on replay.
		* @param meta - the raw persisted meta value.
		* @returns the narrowed descriptor, or `undefined` for the generic path.
		*/
		function visualizeMetaFrom(meta) {
			if (typeof meta !== "object" || meta === null) return void 0;
			const record = meta;
			if (record["kind"] !== "visualize") return void 0;
			const { fragment, title, mode, path, summary } = record;
			if (typeof fragment !== "string" || typeof title !== "string" || typeof path !== "string") return void 0;
			if (!isVisualizeMode(mode)) return void 0;
			return {
				kind: "visualize",
				fragment,
				title,
				mode,
				path,
				...summaryField(summary),
				style: styleIdFrom(record["style"])
			};
		}
		/**
		* The optional summary as a spreadable field: a missing or malformed one is
		* dropped rather than declining the whole card over a caption.
		* @param summary - the raw wire value.
		* @returns `{ summary }` for a non-blank string, otherwise an empty object.
		*/
		function summaryField(summary) {
			return typeof summary === "string" && summary.trim().length > 0 ? { summary: summary.trim() } : {};
		}
		/**
		* Rebuild a descriptor from the call's own arguments when persisted meta is
		* missing. Nested dispatches (`run_code` / PTC) never project presentation
		* meta, but they do log `arguments`; a create's fragment is in that JSON.
		*
		* An `update` without a fragment cannot be rebuilt from the wire (the patched
		* markup lives in execute's value, which nested logs do not keep) and
		* declines. Incomplete streaming JSON is not parsed via throw/catch: only a
		* trailing `}` is treated as complete, otherwise a *closed* `"fragment"`
		* string is taken through {@link extractStreamingFragment}'s scanner.
		* @param argsRaw - running `block.argsRaw` or settled `block.call.argsRaw`.
		* @returns a card descriptor, or `undefined` to keep the quiet fallback.
		*/
		function visualizeMetaFromArgs(argsRaw) {
			if (typeof argsRaw !== "string" || argsRaw.length === 0) return void 0;
			const complete = parseCompleteArgs(argsRaw);
			if (complete !== void 0) {
				if (complete["action"] === "update" && typeof complete["fragment"] !== "string") return void 0;
				return descriptorFromFields(complete["fragment"], complete["title"], complete["mode"], complete["path"], complete["summary"]);
			}
			const closed = scanFragment(argsRaw, true);
			if (closed === void 0) return void 0;
			return descriptorFromFields(closed, void 0, streamedMode(argsRaw), void 0, void 0);
		}
		/**
		* Accept only a complete JSON object, gated on a trailing `}` so a streaming
		* prefix never enters `JSON.parse`.
		* @param raw - accumulated argument text.
		* @returns the object, or `undefined` when the prefix is incomplete or illegal.
		*/
		function parseCompleteArgs(raw) {
			let end = raw.length;
			while (end > 0) {
				const ch = raw[end - 1];
				if (ch === " " || ch === "\n" || ch === "\r" || ch === "	") {
					end -= 1;
					continue;
				}
				break;
			}
			if (end === 0 || raw[end - 1] !== "}") return void 0;
			try {
				const parsed = JSON.parse(raw.slice(0, end));
				if (typeof parsed !== "object" || parsed === null) return void 0;
				return parsed;
			} catch {
				return;
			}
		}
		/**
		* Narrow wire fields into a descriptor. Empty markup after dropping a
		* trailing half-script is declined rather than mounting a blank frame.
		*/
		function descriptorFromFields(fragment, title, mode, path, summary) {
			if (typeof fragment !== "string") return void 0;
			if (mode !== void 0 && !isVisualizeMode(mode)) return void 0;
			const markup = trimStreamingScripts(fragment);
			if (markup.trim().length === 0) return void 0;
			return {
				kind: "visualize",
				fragment: markup,
				title: typeof title === "string" && title.trim().length > 0 ? title.trim() : "Visualization",
				mode: mode ?? "inline",
				path: typeof path === "string" ? path : "",
				...summaryField(summary),
				style: DEFAULT_STYLE
			};
		}
		/**
		* The `mode` of a still-open argument stream, when its string value has
		* already closed. A settled-card fallback that mounts before the JSON ends
		* must not render a page fragment inline just because the object is open.
		* @param argsRaw - accumulated argument text.
		* @returns the streamed mode, or undefined when absent, open, or unknown.
		*/
		function streamedMode(argsRaw) {
			const match = /"mode"\s*:\s*"([a-z]+)"/u.exec(argsRaw);
			return match !== null && isVisualizeMode(match[1]) ? match[1] : void 0;
		}
		/** JSON short escapes, keyed by the character after the backslash. */
		const JSON_ESCAPES = {
			"\"": "\"",
			"\\": "\\",
			"/": "/",
			b: "\b",
			f: "\f",
			n: "\n",
			r: "\r",
			t: "	"
		};
		/**
		* Extract the `fragment` string value from a *possibly incomplete* streaming
		* tool-call JSON argument prefix. The streaming preview calls this on every
		* accumulated delta: it scans for the `"fragment":"` opener, then unescapes
		* characters until the (possibly absent) closing quote, dropping a trailing
		* half-finished escape sequence rather than misreading it.
		* @param argsRaw - the accumulated raw argument text, valid JSON or a prefix.
		* @returns the fragment decoded so far, or `undefined` before the opener streams in.
		*/
		function extractStreamingFragment(argsRaw) {
			return scanFragment(argsRaw, false);
		}
		/**
		* Walk a possibly incomplete `"fragment":"...` value.
		* @param argsRaw - accumulated argument text.
		* @param requireClosed - when true, decline until the closing quote arrives
		*   (the settled-card fallback must not mount on a half-streamed string).
		* @returns the decoded fragment, or `undefined` when the opener is absent
		*   or, if required, the string is still open.
		*/
		function scanFragment(argsRaw, requireClosed) {
			const opener = /"fragment"\s*:\s*"/u.exec(argsRaw);
			if (!opener) return void 0;
			let out = "";
			for (let i = opener.index + opener[0].length; i < argsRaw.length; i++) {
				const ch = argsRaw[i];
				if (ch === "\"") return out;
				if (ch !== "\\") {
					out += ch;
					continue;
				}
				const next = argsRaw[i + 1];
				if (next === void 0) return requireClosed ? void 0 : out;
				if (next === "u") {
					const hex = argsRaw.slice(i + 2, i + 6);
					if (hex.length < 4) return requireClosed ? void 0 : out;
					const code = Number.parseInt(hex, 16);
					if (Number.isNaN(code)) return requireClosed ? void 0 : out;
					out += String.fromCharCode(code);
					i += 5;
					continue;
				}
				const short = JSON_ESCAPES[next];
				if (short === void 0) return requireClosed ? void 0 : out;
				out += short;
				i += 1;
			}
			return requireClosed ? void 0 : out;
		}
		/** Matches the last script opener (complete or still missing its `>`). */
		const LAST_SCRIPT_OPEN = /<script\b[^>]*>?(?![\s\S]*<script\b)/iu;
		/**
		* Prepare a streamed fragment prefix for the live preview: complete
		* `<script>…<\/script>` blocks are kept — they are finished JavaScript the
		* preview shell executes on arrival, which is how a script-drawn chart paints
		* during generation — while a trailing block whose `<\/script>` has not
		* streamed in yet is dropped whole (a half-streamed body is almost never
		* valid JavaScript).
		* @param fragment - the fragment prefix streamed so far.
		* @returns the preview-safe markup.
		*/
		function trimStreamingScripts(fragment) {
			const opener = LAST_SCRIPT_OPEN.exec(fragment);
			if (!opener) return fragment;
			const rest = fragment.slice(opener.index + opener[0].length);
			return /<\/script\s*>/iu.test(rest) ? fragment : fragment.slice(0, opener.index);
		}
		//#endregion
		//#region src/frame-css.ts
		/**
		* The stylesheet injected into every visualization frame: theme tokens with
		* host-bridged overrides, a minimal reset, and the base-class vocabulary the
		* bundled skill teaches (`.card`, `.btn`, `.viz-*`, form utilities). Kept as a
		* TS string so the browser bundle needs no CSS loader and the node-side specs
		* can assert against it.
		*
		* Token contract: every `--<name>` here is declared as
		* `var(--dsh-viz-<name>, <fallback>)`. The card resolves the host palette
		* (DSH `--dsw-alias-*` design tokens, whale-blue accent included) and injects
		* the `--dsh-viz-*` values on the frame's `:root`; outside DSH the fallbacks
		* keep the frame legible in both appearances via `light-dark()`. A card
		* style (style.ts) injects its own `--dsh-viz-*` values over the host ones;
		* the defaults here are the `whale` style. `--viz-grid-axes` (`value`,
		* `both`, `none`), `--viz-grid-dash` and `--viz-line-width` carry no CSS
		* meaning of their own: `dshViz.chartDefaults` reads them for Chart.js.
		*
		* @module @lbryany/dsh-widget/frame-css
		*/
		/** The frame stylesheet, inlined into the sandboxed srcdoc document. */
		const FRAME_CSS = `
:root {
  color-scheme: light dark;
  --background: var(--dsh-viz-background, transparent);
  --foreground: var(--dsh-viz-foreground, light-dark(rgb(26 28 31), rgb(240 242 245)));
  --card: var(--dsh-viz-card, light-dark(rgb(0 0 0 / 4%), rgb(255 255 255 / 6%)));
  --card-foreground: var(--dsh-viz-card-foreground, var(--foreground));
  --muted-foreground: var(--dsh-viz-muted-foreground, light-dark(rgb(26 28 31 / 55%), rgb(240 242 245 / 55%)));
  --border: var(--dsh-viz-border, light-dark(rgb(0 0 0 / 10%), rgb(255 255 255 / 12%)));
  --primary: var(--dsh-viz-primary, light-dark(rgb(65 118 230), rgb(110 150 240)));
  --primary-foreground: var(--dsh-viz-primary-foreground, light-dark(rgb(255 255 255), rgb(13 13 13)));
  --viz-series-1: var(--dsh-viz-series-1, var(--primary));
  --viz-series-2: var(--dsh-viz-series-2, light-dark(rgb(225 105 16), rgb(236 142 59)));
  --viz-series-3: var(--dsh-viz-series-3, light-dark(rgb(2 155 100), rgb(72 196 130)));
  --viz-series-4: var(--dsh-viz-series-4, light-dark(rgb(147 89 185), rgb(183 145 226)));
  --viz-series-5: var(--dsh-viz-series-5, light-dark(rgb(214 63 76), rgb(233 108 122)));
  --viz-series-6: var(--dsh-viz-series-6, light-dark(rgb(154 139 45), rgb(206 182 70)));
  --viz-context: var(--dsh-viz-context, var(--muted-foreground));
  --viz-grid: var(--dsh-viz-grid, var(--border));
  --viz-grid-axes: var(--dsh-viz-grid-axes, value);
  --viz-grid-dash: var(--dsh-viz-grid-dash, 0);
  --viz-axis: var(--dsh-viz-axis, var(--border));
  --viz-line-width: var(--dsh-viz-line-width, 2);
  --font-sans: var(--dsh-viz-font-sans, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);
  --font-display: var(--dsh-viz-font-display, var(--font-sans));
  --font-mono: var(--dsh-viz-font-mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
  --radius: var(--dsh-viz-radius, 8px);
  --font-size-base: var(--dsh-viz-font-size-base, 14px);
  --font-size-small: var(--dsh-viz-font-size-small, max(11px, calc(var(--font-size-base) - 2px)));
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--background);
  color: var(--foreground);
  font: 400 var(--font-size-base)/1.5 var(--font-sans);
}
h1, h2, h3 { margin: 0 0 0.5em; font-family: var(--font-display); font-weight: 500; line-height: 1.3; }
h1 { font-size: 1.3em; }
h2 { font-size: 1.15em; }
h3 { font-size: 1em; }
p { margin: 0 0 0.75em; }
a { color: var(--primary); }
code, kbd, samp, pre { font-family: var(--font-mono); }
svg text { fill: var(--foreground); font-size: var(--font-size-small); }
.text-small { font-size: var(--font-size-small); color: var(--muted-foreground); }

.card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
}

.btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--foreground);
  font: inherit;
  cursor: pointer;
}
.btn:hover { background: color-mix(in oklab, var(--foreground) 6%, transparent); }
.btn-primary,
.btn[aria-pressed='true'],
.btn[aria-selected='true'],
.btn.is-selected {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
.btn-ghost { border-color: transparent; }
.btn:disabled { opacity: 0.5; cursor: default; }

.viz-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.viz-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.viz-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px;
  margin-bottom: 12px;
}
.viz-stat .viz-stat-label,
.viz-stat > :first-child { font-size: var(--font-size-small); color: var(--muted-foreground); }
.viz-stat-value { font-size: 1.4em; font-weight: 500; line-height: 1.2; }
.viz-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--primary) 14%, transparent);
  color: var(--primary);
  font-size: var(--font-size-small);
}

.form-label { display: block; font-size: var(--font-size-small); color: var(--muted-foreground); margin-bottom: 4px; }
.form-control, .form-select {
  width: 100%;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--foreground);
  font: inherit;
}
.form-check { display: flex; align-items: center; gap: 6px; }
.form-check input { accent-color: var(--primary); }
input[type='range'] { accent-color: var(--primary); }

table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 5px 10px; border-bottom: 1px solid var(--border); }
th { font-weight: 500; color: var(--muted-foreground); font-size: var(--font-size-small); }
.table-responsive { overflow-x: auto; }
`;
		/**
		* Additions for a `page` frame: a full browser tab rather than a card in the
		* chat column. The surface turns opaque (a sticky header must cover what
		* scrolls under it), the body drops the card inset so a header can run
		* edge to edge, and a few layout classes cover the page skeleton the skill
		* teaches: a sticky header, a centred content container, sections, tabs.
		*/
		const PAGE_CSS = `
:root { --background: var(--dsh-viz-page, light-dark(rgb(255 255 255), rgb(24 24 27))); }
html { background: var(--background); }
body { min-height: 100vh; }
.viz-page { max-width: 1440px; margin: 0 auto; padding: 24px clamp(16px, 3vw, 40px) 48px; }
.viz-page-narrow { max-width: 960px; }
.viz-page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 12px clamp(16px, 3vw, 40px);
  background: var(--background);
  border-bottom: 1px solid var(--border);
}
.viz-page-header h1 { margin: 0; font-size: 1.25em; }
.viz-page-header .viz-controls { margin: 0 0 0 auto; }
.viz-section { margin-top: 32px; }
.viz-section:first-child { margin-top: 0; }
.viz-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
.viz-tab {
  appearance: none;
  padding: 8px 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  cursor: pointer;
}
.viz-tab:hover { color: var(--foreground); }
.viz-tab[aria-selected='true'] { color: var(--foreground); border-bottom-color: var(--primary); font-weight: 500; }
@media (max-width: 768px) {
  .viz-page-header .viz-controls { margin-left: 0; width: 100%; }
}
`;
		//#endregion
		//#region src/viz-helper.ts
		/**
		* The helper's inline script body for one card style.
		* @param style - the card's style id, exposed as `dshViz.style`.
		* @param chart - the style's Chart.js knobs beyond its CSS tokens.
		* @returns the script body.
		*/
		function vizHelperScript(style, chart) {
			return `
(function () {
  var STYLE = ${JSON.stringify(style)};
  var CHART = ${JSON.stringify(chart)};
  var GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|emoji|math)$/;
  var paint = null;
  function host(root) { return root || document.body || document.documentElement; }
  function probe(root, prop, value) {
    var span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.setProperty(prop, value);
    host(root).appendChild(span);
    var out = getComputedStyle(span).getPropertyValue(prop);
    span.remove();
    return out;
  }
  // A light-dark() nested inside another function (color-mix) survives into
  // the computed value, and canvas has no colour scheme to resolve it with:
  // pick the branch for the frame's scheme here.
  function pickScheme(css) {
    var dark = /dark/.test(getComputedStyle(document.documentElement).colorScheme);
    for (var at = css.indexOf('light-dark('); at !== -1; at = css.indexOf('light-dark(')) {
      var depth = 0, comma = -1, i = at + 11;
      for (; i < css.length; i++) {
        var ch = css.charAt(i);
        if (ch === '(') depth++;
        else if (ch === ')') { if (depth === 0) break; depth--; }
        else if (ch === ',' && depth === 0 && comma === -1) comma = i;
      }
      if (comma === -1 || i >= css.length) break;
      css = css.slice(0, at) + (dark ? css.slice(comma + 1, i) : css.slice(at + 11, comma)).trim() + css.slice(i + 1);
    }
    return css;
  }
  // Any CSS colour (light-dark, color-mix, hex) normalised through canvas.
  function rgba(css) {
    paint = paint || document.createElement('canvas').getContext('2d');
    paint.fillStyle = '#000';
    paint.fillStyle = pickScheme(css);
    var s = String(paint.fillStyle);
    if (s.charAt(0) === '#') {
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
    }
    var m = s.match(/[\\d.]+/g) || ['0', '0', '0'];
    // color-mix() and friends serialise as color(srgb r g b / a) with 0–1 channels.
    var k = /^color\\(srgb /.test(s) ? 255 : /^rgba?\\(/.test(s) ? 1 : 0;
    if (k === 0) return null;
    return [Math.round(Number(m[0]) * k), Math.round(Number(m[1]) * k), Math.round(Number(m[2]) * k), m.length > 3 ? Number(m[3]) : 1];
  }
  function alpha(css, a) {
    var c = rgba(css);
    if (c === null) return pickScheme(css);
    return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + Number((c[3] * (a === undefined ? 1 : a)).toFixed(3)) + ')';
  }
  function color(token, a, root) { return alpha(probe(root, 'color', 'var(' + token + ')'), a); }
  function raw(token, root) { return getComputedStyle(host(root)).getPropertyValue(token).trim(); }
  function smallSize(root) { return Math.max(11, parseFloat(probe(root, 'font-size', 'var(--font-size-small)')) || 12); }
  function family(root) { return getComputedStyle(host(root)).fontFamily; }
  function isValueAxis(scale) {
    var options = scale && scale.chart && scale.chart.options;
    return scale.axis !== ((options && options.indexAxis) || 'x');
  }
  function chartDefaults(Chart, root) {
    var d = Chart.defaults;
    var axes = raw('--viz-grid-axes', root) || 'value';
    var dash = (raw('--viz-grid-dash', root) || '0').split(/[\\s,]+/).map(Number).filter(function (n) { return n > 0; });
    var theme = {
      style: STYLE,
      fontFamily: family(root),
      fontSize: smallSize(root),
      foreground: color('--foreground', 1, root),
      muted: color('--muted-foreground', 1, root),
      primary: color('--primary', 1, root),
      context: color('--viz-context', 1, root),
      grid: color('--viz-grid', 1, root),
      axis: color('--viz-axis', 1, root),
      lineWidth: Number(raw('--viz-line-width', root)) || 2,
      series: [1, 2, 3, 4, 5, 6].map(function (i) { return color('--viz-series-' + i, 1, root); }),
      alpha: alpha,
    };
    d.font.family = theme.fontFamily;
    d.font.size = theme.fontSize;
    d.color = theme.muted;
    d.borderColor = theme.grid;
    var scale = d.scale;
    scale.grid.color = theme.grid;
    scale.border.color = theme.axis;
    // Chart.js 4 dashes gridlines through border.dash (the axis line too).
    scale.border.dash = dash;
    if (CHART.axisWidth) scale.border.width = CHART.axisWidth;
    if (axes === 'none') {
      // L-shaped axes with short outward ticks, no gridlines.
      scale.grid.drawOnChartArea = false;
      scale.grid.tickLength = 4;
      scale.grid.color = theme.axis;
    } else if (axes !== 'both') {
      scale.grid.display = function (ctx) { return isValueAxis(ctx.scale); };
    }
    if (CHART.valueAxisLine === false) {
      scale.border.display = function (ctx) { return !isValueAxis(ctx.scale); };
    }
    var line = d.elements.line, point = d.elements.point;
    line.borderWidth = theme.lineWidth;
    if (CHART.tension !== undefined) line.tension = CHART.tension;
    if (CHART.pointRadius !== undefined) point.radius = CHART.pointRadius;
    if (CHART.pointStyles) {
      point.pointStyle = function (ctx) { return CHART.pointStyles[ctx.datasetIndex % CHART.pointStyles.length]; };
      d.plugins.legend.labels.usePointStyle = true;
    }
    if (CHART.dashes) {
      line.borderDash = function (ctx) { return CHART.dashes[ctx.datasetIndex % CHART.dashes.length]; };
    }
    return theme;
  }
  function fontsReady(text, root) {
    var fonts = document.fonts;
    if (!fonts || typeof fonts.load !== 'function') return Promise.resolve();
    var size = smallSize(root);
    var sample = (text || '') + ' ' + ((document.body && document.body.textContent) || '').slice(0, 600) + ' 0123456789';
    var names = family(root).split(',').map(function (n) { return n.trim(); })
      .filter(function (n) { return n.length > 0 && !GENERIC.test(n); }).slice(0, 3);
    var loads = names.map(function (n) {
      return fonts.load('400 ' + size + 'px ' + n, sample).catch(function () {});
    });
    var settled = Promise.all(loads).then(function () { return fonts.ready; });
    return Promise.race([settled, new Promise(function (done) { setTimeout(done, 2500); })]);
  }
  window.dshViz = { style: STYLE, color: color, chartDefaults: chartDefaults, fontsReady: fontsReady };
})();
`;
		}
		//#endregion
		//#region node_modules/zod/v3/helpers/util.js
		var util;
		(function(util) {
			util.assertEqual = (_) => {};
			function assertIs(_arg) {}
			util.assertIs = assertIs;
			function assertNever(_x) {
				throw new Error();
			}
			util.assertNever = assertNever;
			util.arrayToEnum = (items) => {
				const obj = {};
				for (const item of items) obj[item] = item;
				return obj;
			};
			util.getValidEnumValues = (obj) => {
				const validKeys = util.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
				const filtered = {};
				for (const k of validKeys) filtered[k] = obj[k];
				return util.objectValues(filtered);
			};
			util.objectValues = (obj) => {
				return util.objectKeys(obj).map(function(e) {
					return obj[e];
				});
			};
			util.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
				const keys = [];
				for (const key in object) if (Object.prototype.hasOwnProperty.call(object, key)) keys.push(key);
				return keys;
			};
			util.find = (arr, checker) => {
				for (const item of arr) if (checker(item)) return item;
			};
			util.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
			function joinValues(array, separator = " | ") {
				return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
			}
			util.joinValues = joinValues;
			util.jsonStringifyReplacer = (_, value) => {
				if (typeof value === "bigint") return value.toString();
				return value;
			};
		})(util || (util = {}));
		var objectUtil;
		(function(objectUtil) {
			objectUtil.mergeShapes = (first, second) => {
				return {
					...first,
					...second
				};
			};
		})(objectUtil || (objectUtil = {}));
		const ZodParsedType = util.arrayToEnum([
			"string",
			"nan",
			"number",
			"integer",
			"float",
			"boolean",
			"date",
			"bigint",
			"symbol",
			"function",
			"undefined",
			"null",
			"array",
			"object",
			"unknown",
			"promise",
			"void",
			"never",
			"map",
			"set"
		]);
		const getParsedType = (data) => {
			switch (typeof data) {
				case "undefined": return ZodParsedType.undefined;
				case "string": return ZodParsedType.string;
				case "number": return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
				case "boolean": return ZodParsedType.boolean;
				case "function": return ZodParsedType.function;
				case "bigint": return ZodParsedType.bigint;
				case "symbol": return ZodParsedType.symbol;
				case "object":
					if (Array.isArray(data)) return ZodParsedType.array;
					if (data === null) return ZodParsedType.null;
					if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") return ZodParsedType.promise;
					if (typeof Map !== "undefined" && data instanceof Map) return ZodParsedType.map;
					if (typeof Set !== "undefined" && data instanceof Set) return ZodParsedType.set;
					if (typeof Date !== "undefined" && data instanceof Date) return ZodParsedType.date;
					return ZodParsedType.object;
				default: return ZodParsedType.unknown;
			}
		};
		//#endregion
		//#region node_modules/zod/v3/ZodError.js
		const ZodIssueCode = util.arrayToEnum([
			"invalid_type",
			"invalid_literal",
			"custom",
			"invalid_union",
			"invalid_union_discriminator",
			"invalid_enum_value",
			"unrecognized_keys",
			"invalid_arguments",
			"invalid_return_type",
			"invalid_date",
			"invalid_string",
			"too_small",
			"too_big",
			"invalid_intersection_types",
			"not_multiple_of",
			"not_finite"
		]);
		var ZodError = class ZodError extends Error {
			get errors() {
				return this.issues;
			}
			constructor(issues) {
				super();
				this.issues = [];
				this.addIssue = (sub) => {
					this.issues = [...this.issues, sub];
				};
				this.addIssues = (subs = []) => {
					this.issues = [...this.issues, ...subs];
				};
				const actualProto = new.target.prototype;
				if (Object.setPrototypeOf) Object.setPrototypeOf(this, actualProto);
				else this.__proto__ = actualProto;
				this.name = "ZodError";
				this.issues = issues;
			}
			format(_mapper) {
				const mapper = _mapper || function(issue) {
					return issue.message;
				};
				const fieldErrors = { _errors: [] };
				const processError = (error) => {
					for (const issue of error.issues) if (issue.code === "invalid_union") issue.unionErrors.map(processError);
					else if (issue.code === "invalid_return_type") processError(issue.returnTypeError);
					else if (issue.code === "invalid_arguments") processError(issue.argumentsError);
					else if (issue.path.length === 0) fieldErrors._errors.push(mapper(issue));
					else {
						let curr = fieldErrors;
						let i = 0;
						while (i < issue.path.length) {
							const el = issue.path[i];
							if (!(i === issue.path.length - 1)) curr[el] = curr[el] || { _errors: [] };
							else {
								curr[el] = curr[el] || { _errors: [] };
								curr[el]._errors.push(mapper(issue));
							}
							curr = curr[el];
							i++;
						}
					}
				};
				processError(this);
				return fieldErrors;
			}
			static assert(value) {
				if (!(value instanceof ZodError)) throw new Error(`Not a ZodError: ${value}`);
			}
			toString() {
				return this.message;
			}
			get message() {
				return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
			}
			get isEmpty() {
				return this.issues.length === 0;
			}
			flatten(mapper = (issue) => issue.message) {
				const fieldErrors = {};
				const formErrors = [];
				for (const sub of this.issues) if (sub.path.length > 0) {
					const firstEl = sub.path[0];
					fieldErrors[firstEl] = fieldErrors[firstEl] || [];
					fieldErrors[firstEl].push(mapper(sub));
				} else formErrors.push(mapper(sub));
				return {
					formErrors,
					fieldErrors
				};
			}
			get formErrors() {
				return this.flatten();
			}
		};
		ZodError.create = (issues) => {
			return new ZodError(issues);
		};
		//#endregion
		//#region node_modules/zod/v3/locales/en.js
		const errorMap = (issue, _ctx) => {
			let message;
			switch (issue.code) {
				case ZodIssueCode.invalid_type:
					if (issue.received === ZodParsedType.undefined) message = "Required";
					else message = `Expected ${issue.expected}, received ${issue.received}`;
					break;
				case ZodIssueCode.invalid_literal:
					message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
					break;
				case ZodIssueCode.unrecognized_keys:
					message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
					break;
				case ZodIssueCode.invalid_union:
					message = `Invalid input`;
					break;
				case ZodIssueCode.invalid_union_discriminator:
					message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
					break;
				case ZodIssueCode.invalid_enum_value:
					message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
					break;
				case ZodIssueCode.invalid_arguments:
					message = `Invalid function arguments`;
					break;
				case ZodIssueCode.invalid_return_type:
					message = `Invalid function return type`;
					break;
				case ZodIssueCode.invalid_date:
					message = `Invalid date`;
					break;
				case ZodIssueCode.invalid_string:
					if (typeof issue.validation === "object") {
						if ("includes" in issue.validation) {
							message = `Invalid input: must include "${issue.validation.includes}"`;
							if (typeof issue.validation.position === "number") message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
						} else if ("startsWith" in issue.validation) message = `Invalid input: must start with "${issue.validation.startsWith}"`;
						else if ("endsWith" in issue.validation) message = `Invalid input: must end with "${issue.validation.endsWith}"`;
						else util.assertNever(issue.validation);
					} else if (issue.validation !== "regex") message = `Invalid ${issue.validation}`;
					else message = "Invalid";
					break;
				case ZodIssueCode.too_small:
					if (issue.type === "array") message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
					else if (issue.type === "string") message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
					else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
					else if (issue.type === "bigint") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
					else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
					else message = "Invalid input";
					break;
				case ZodIssueCode.too_big:
					if (issue.type === "array") message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
					else if (issue.type === "string") message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
					else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
					else if (issue.type === "bigint") message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
					else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
					else message = "Invalid input";
					break;
				case ZodIssueCode.custom:
					message = `Invalid input`;
					break;
				case ZodIssueCode.invalid_intersection_types:
					message = `Intersection results could not be merged`;
					break;
				case ZodIssueCode.not_multiple_of:
					message = `Number must be a multiple of ${issue.multipleOf}`;
					break;
				case ZodIssueCode.not_finite:
					message = "Number must be finite";
					break;
				default:
					message = _ctx.defaultError;
					util.assertNever(issue);
			}
			return { message };
		};
		//#endregion
		//#region node_modules/zod/v3/errors.js
		let overrideErrorMap = errorMap;
		function getErrorMap() {
			return overrideErrorMap;
		}
		//#endregion
		//#region node_modules/zod/v3/helpers/parseUtil.js
		const makeIssue = (params) => {
			const { data, path, errorMaps, issueData } = params;
			const fullPath = [...path, ...issueData.path || []];
			const fullIssue = {
				...issueData,
				path: fullPath
			};
			if (issueData.message !== void 0) return {
				...issueData,
				path: fullPath,
				message: issueData.message
			};
			let errorMessage = "";
			const maps = errorMaps.filter((m) => !!m).slice().reverse();
			for (const map of maps) errorMessage = map(fullIssue, {
				data,
				defaultError: errorMessage
			}).message;
			return {
				...issueData,
				path: fullPath,
				message: errorMessage
			};
		};
		function addIssueToContext(ctx, issueData) {
			const overrideMap = getErrorMap();
			const issue = makeIssue({
				issueData,
				data: ctx.data,
				path: ctx.path,
				errorMaps: [
					ctx.common.contextualErrorMap,
					ctx.schemaErrorMap,
					overrideMap,
					overrideMap === errorMap ? void 0 : errorMap
				].filter((x) => !!x)
			});
			ctx.common.issues.push(issue);
		}
		var ParseStatus = class ParseStatus {
			constructor() {
				this.value = "valid";
			}
			dirty() {
				if (this.value === "valid") this.value = "dirty";
			}
			abort() {
				if (this.value !== "aborted") this.value = "aborted";
			}
			static mergeArray(status, results) {
				const arrayValue = [];
				for (const s of results) {
					if (s.status === "aborted") return INVALID;
					if (s.status === "dirty") status.dirty();
					arrayValue.push(s.value);
				}
				return {
					status: status.value,
					value: arrayValue
				};
			}
			static async mergeObjectAsync(status, pairs) {
				const syncPairs = [];
				for (const pair of pairs) {
					const key = await pair.key;
					const value = await pair.value;
					syncPairs.push({
						key,
						value
					});
				}
				return ParseStatus.mergeObjectSync(status, syncPairs);
			}
			static mergeObjectSync(status, pairs) {
				const finalObject = {};
				for (const pair of pairs) {
					const { key, value } = pair;
					if (key.status === "aborted") return INVALID;
					if (value.status === "aborted") return INVALID;
					if (key.status === "dirty") status.dirty();
					if (value.status === "dirty") status.dirty();
					if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) finalObject[key.value] = value.value;
				}
				return {
					status: status.value,
					value: finalObject
				};
			}
		};
		const INVALID = Object.freeze({ status: "aborted" });
		const DIRTY = (value) => ({
			status: "dirty",
			value
		});
		const OK = (value) => ({
			status: "valid",
			value
		});
		const isAborted = (x) => x.status === "aborted";
		const isDirty = (x) => x.status === "dirty";
		const isValid = (x) => x.status === "valid";
		const isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
		//#endregion
		//#region node_modules/zod/v3/helpers/errorUtil.js
		var errorUtil;
		(function(errorUtil) {
			errorUtil.errToObj = (message) => typeof message === "string" ? { message } : message || {};
			errorUtil.toString = (message) => typeof message === "string" ? message : message?.message;
		})(errorUtil || (errorUtil = {}));
		//#endregion
		//#region node_modules/zod/v3/types.js
		var ParseInputLazyPath = class {
			constructor(parent, value, path, key) {
				this._cachedPath = [];
				this.parent = parent;
				this.data = value;
				this._path = path;
				this._key = key;
			}
			get path() {
				if (!this._cachedPath.length) {
					if (Array.isArray(this._key)) this._cachedPath.push(...this._path, ...this._key);
					else this._cachedPath.push(...this._path, this._key);
				}
				return this._cachedPath;
			}
		};
		const handleResult = (ctx, result) => {
			if (isValid(result)) return {
				success: true,
				data: result.value
			};
			else {
				if (!ctx.common.issues.length) throw new Error("Validation failed but no issues detected.");
				return {
					success: false,
					get error() {
						if (this._error) return this._error;
						const error = new ZodError(ctx.common.issues);
						this._error = error;
						return this._error;
					}
				};
			}
		};
		function processCreateParams(params) {
			if (!params) return {};
			const { errorMap, invalid_type_error, required_error, description } = params;
			if (errorMap && (invalid_type_error || required_error)) throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
			if (errorMap) return {
				errorMap,
				description
			};
			const customMap = (iss, ctx) => {
				const { message } = params;
				if (iss.code === "invalid_enum_value") return { message: message ?? ctx.defaultError };
				if (typeof ctx.data === "undefined") return { message: message ?? required_error ?? ctx.defaultError };
				if (iss.code !== "invalid_type") return { message: ctx.defaultError };
				return { message: message ?? invalid_type_error ?? ctx.defaultError };
			};
			return {
				errorMap: customMap,
				description
			};
		}
		var ZodType = class {
			get description() {
				return this._def.description;
			}
			_getType(input) {
				return getParsedType(input.data);
			}
			_getOrReturnCtx(input, ctx) {
				return ctx || {
					common: input.parent.common,
					data: input.data,
					parsedType: getParsedType(input.data),
					schemaErrorMap: this._def.errorMap,
					path: input.path,
					parent: input.parent
				};
			}
			_processInputParams(input) {
				return {
					status: new ParseStatus(),
					ctx: {
						common: input.parent.common,
						data: input.data,
						parsedType: getParsedType(input.data),
						schemaErrorMap: this._def.errorMap,
						path: input.path,
						parent: input.parent
					}
				};
			}
			_parseSync(input) {
				const result = this._parse(input);
				if (isAsync(result)) throw new Error("Synchronous parse encountered promise.");
				return result;
			}
			_parseAsync(input) {
				const result = this._parse(input);
				return Promise.resolve(result);
			}
			parse(data, params) {
				const result = this.safeParse(data, params);
				if (result.success) return result.data;
				throw result.error;
			}
			safeParse(data, params) {
				const ctx = {
					common: {
						issues: [],
						async: params?.async ?? false,
						contextualErrorMap: params?.errorMap
					},
					path: params?.path || [],
					schemaErrorMap: this._def.errorMap,
					parent: null,
					data,
					parsedType: getParsedType(data)
				};
				const result = this._parseSync({
					data,
					path: ctx.path,
					parent: ctx
				});
				return handleResult(ctx, result);
			}
			"~validate"(data) {
				const ctx = {
					common: {
						issues: [],
						async: !!this["~standard"].async
					},
					path: [],
					schemaErrorMap: this._def.errorMap,
					parent: null,
					data,
					parsedType: getParsedType(data)
				};
				if (!this["~standard"].async) try {
					const result = this._parseSync({
						data,
						path: [],
						parent: ctx
					});
					return isValid(result) ? { value: result.value } : { issues: ctx.common.issues };
				} catch (err) {
					if (err?.message?.toLowerCase()?.includes("encountered")) this["~standard"].async = true;
					ctx.common = {
						issues: [],
						async: true
					};
				}
				return this._parseAsync({
					data,
					path: [],
					parent: ctx
				}).then((result) => isValid(result) ? { value: result.value } : { issues: ctx.common.issues });
			}
			async parseAsync(data, params) {
				const result = await this.safeParseAsync(data, params);
				if (result.success) return result.data;
				throw result.error;
			}
			async safeParseAsync(data, params) {
				const ctx = {
					common: {
						issues: [],
						contextualErrorMap: params?.errorMap,
						async: true
					},
					path: params?.path || [],
					schemaErrorMap: this._def.errorMap,
					parent: null,
					data,
					parsedType: getParsedType(data)
				};
				const maybeAsyncResult = this._parse({
					data,
					path: ctx.path,
					parent: ctx
				});
				const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
				return handleResult(ctx, result);
			}
			refine(check, message) {
				const getIssueProperties = (val) => {
					if (typeof message === "string" || typeof message === "undefined") return { message };
					else if (typeof message === "function") return message(val);
					else return message;
				};
				return this._refinement((val, ctx) => {
					const result = check(val);
					const setError = () => ctx.addIssue({
						code: ZodIssueCode.custom,
						...getIssueProperties(val)
					});
					if (typeof Promise !== "undefined" && result instanceof Promise) return result.then((data) => {
						if (!data) {
							setError();
							return false;
						} else return true;
					});
					if (!result) {
						setError();
						return false;
					} else return true;
				});
			}
			refinement(check, refinementData) {
				return this._refinement((val, ctx) => {
					if (!check(val)) {
						ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
						return false;
					} else return true;
				});
			}
			_refinement(refinement) {
				return new ZodEffects({
					schema: this,
					typeName: ZodFirstPartyTypeKind.ZodEffects,
					effect: {
						type: "refinement",
						refinement
					}
				});
			}
			superRefine(refinement) {
				return this._refinement(refinement);
			}
			constructor(def) {
				/** Alias of safeParseAsync */
				this.spa = this.safeParseAsync;
				this._def = def;
				this.parse = this.parse.bind(this);
				this.safeParse = this.safeParse.bind(this);
				this.parseAsync = this.parseAsync.bind(this);
				this.safeParseAsync = this.safeParseAsync.bind(this);
				this.spa = this.spa.bind(this);
				this.refine = this.refine.bind(this);
				this.refinement = this.refinement.bind(this);
				this.superRefine = this.superRefine.bind(this);
				this.optional = this.optional.bind(this);
				this.nullable = this.nullable.bind(this);
				this.nullish = this.nullish.bind(this);
				this.array = this.array.bind(this);
				this.promise = this.promise.bind(this);
				this.or = this.or.bind(this);
				this.and = this.and.bind(this);
				this.transform = this.transform.bind(this);
				this.brand = this.brand.bind(this);
				this.default = this.default.bind(this);
				this.catch = this.catch.bind(this);
				this.describe = this.describe.bind(this);
				this.pipe = this.pipe.bind(this);
				this.readonly = this.readonly.bind(this);
				this.isNullable = this.isNullable.bind(this);
				this.isOptional = this.isOptional.bind(this);
				this["~standard"] = {
					version: 1,
					vendor: "zod",
					validate: (data) => this["~validate"](data)
				};
			}
			optional() {
				return ZodOptional.create(this, this._def);
			}
			nullable() {
				return ZodNullable.create(this, this._def);
			}
			nullish() {
				return this.nullable().optional();
			}
			array() {
				return ZodArray.create(this);
			}
			promise() {
				return ZodPromise.create(this, this._def);
			}
			or(option) {
				return ZodUnion.create([this, option], this._def);
			}
			and(incoming) {
				return ZodIntersection.create(this, incoming, this._def);
			}
			transform(transform) {
				return new ZodEffects({
					...processCreateParams(this._def),
					schema: this,
					typeName: ZodFirstPartyTypeKind.ZodEffects,
					effect: {
						type: "transform",
						transform
					}
				});
			}
			default(def) {
				const defaultValueFunc = typeof def === "function" ? def : () => def;
				return new ZodDefault({
					...processCreateParams(this._def),
					innerType: this,
					defaultValue: defaultValueFunc,
					typeName: ZodFirstPartyTypeKind.ZodDefault
				});
			}
			brand() {
				return new ZodBranded({
					typeName: ZodFirstPartyTypeKind.ZodBranded,
					type: this,
					...processCreateParams(this._def)
				});
			}
			catch(def) {
				const catchValueFunc = typeof def === "function" ? def : () => def;
				return new ZodCatch({
					...processCreateParams(this._def),
					innerType: this,
					catchValue: catchValueFunc,
					typeName: ZodFirstPartyTypeKind.ZodCatch
				});
			}
			describe(description) {
				const This = this.constructor;
				return new This({
					...this._def,
					description
				});
			}
			pipe(target) {
				return ZodPipeline.create(this, target);
			}
			readonly() {
				return ZodReadonly.create(this);
			}
			isOptional() {
				return this.safeParse(void 0).success;
			}
			isNullable() {
				return this.safeParse(null).success;
			}
		};
		const cuidRegex = /^c[^\s-]{8,}$/i;
		const cuid2Regex = /^[0-9a-z]+$/;
		const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
		const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
		const nanoidRegex = /^[a-z0-9_-]{21}$/i;
		const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
		const durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
		const emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
		const _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
		let emojiRegex;
		const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
		const ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
		const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
		const ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
		const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
		const base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
		const dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
		const dateRegex = new RegExp(`^${dateRegexSource}$`);
		function timeRegexSource(args) {
			let secondsRegexSource = `[0-5]\\d`;
			if (args.precision) secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
			else if (args.precision == null) secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
			const secondsQuantifier = args.precision ? "+" : "?";
			return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
		}
		function timeRegex(args) {
			return new RegExp(`^${timeRegexSource(args)}$`);
		}
		function datetimeRegex(args) {
			let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
			const opts = [];
			opts.push(args.local ? `Z?` : `Z`);
			if (args.offset) opts.push(`([+-]\\d{2}:?\\d{2})`);
			regex = `${regex}(${opts.join("|")})`;
			return new RegExp(`^${regex}$`);
		}
		function isValidIP(ip, version) {
			if ((version === "v4" || !version) && ipv4Regex.test(ip)) return true;
			if ((version === "v6" || !version) && ipv6Regex.test(ip)) return true;
			return false;
		}
		function isValidJWT(jwt, alg) {
			if (!jwtRegex.test(jwt)) return false;
			try {
				const [header] = jwt.split(".");
				if (!header) return false;
				const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
				const decoded = JSON.parse(atob(base64));
				if (typeof decoded !== "object" || decoded === null) return false;
				if ("typ" in decoded && decoded?.typ !== "JWT") return false;
				if (!decoded.alg) return false;
				if (alg && decoded.alg !== alg) return false;
				return true;
			} catch {
				return false;
			}
		}
		function isValidCidr(ip, version) {
			if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) return true;
			if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) return true;
			return false;
		}
		var ZodString = class ZodString extends ZodType {
			_parse(input) {
				if (this._def.coerce) input.data = String(input.data);
				if (this._getType(input) !== ZodParsedType.string) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.string,
						received: ctx.parsedType
					});
					return INVALID;
				}
				const status = new ParseStatus();
				let ctx = void 0;
				for (const check of this._def.checks) if (check.kind === "min") {
					if (input.data.length < check.value) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_small,
							minimum: check.value,
							type: "string",
							inclusive: true,
							exact: false,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "max") {
					if (input.data.length > check.value) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_big,
							maximum: check.value,
							type: "string",
							inclusive: true,
							exact: false,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "length") {
					const tooBig = input.data.length > check.value;
					const tooSmall = input.data.length < check.value;
					if (tooBig || tooSmall) {
						ctx = this._getOrReturnCtx(input, ctx);
						if (tooBig) addIssueToContext(ctx, {
							code: ZodIssueCode.too_big,
							maximum: check.value,
							type: "string",
							inclusive: true,
							exact: true,
							message: check.message
						});
						else if (tooSmall) addIssueToContext(ctx, {
							code: ZodIssueCode.too_small,
							minimum: check.value,
							type: "string",
							inclusive: true,
							exact: true,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "email") {
					if (!emailRegex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "email",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "emoji") {
					if (!emojiRegex) emojiRegex = new RegExp(_emojiRegex, "u");
					if (!emojiRegex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "emoji",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "uuid") {
					if (!uuidRegex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "uuid",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "nanoid") {
					if (!nanoidRegex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "nanoid",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "cuid") {
					if (!cuidRegex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "cuid",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "cuid2") {
					if (!cuid2Regex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "cuid2",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "ulid") {
					if (!ulidRegex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "ulid",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "url") try {
					new URL(input.data);
				} catch {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "url",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
				else if (check.kind === "regex") {
					check.regex.lastIndex = 0;
					if (!check.regex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "regex",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "trim") input.data = input.data.trim();
				else if (check.kind === "includes") {
					if (!input.data.includes(check.value, check.position)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.invalid_string,
							validation: {
								includes: check.value,
								position: check.position
							},
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "toLowerCase") input.data = input.data.toLowerCase();
				else if (check.kind === "toUpperCase") input.data = input.data.toUpperCase();
				else if (check.kind === "startsWith") {
					if (!input.data.startsWith(check.value)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.invalid_string,
							validation: { startsWith: check.value },
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "endsWith") {
					if (!input.data.endsWith(check.value)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.invalid_string,
							validation: { endsWith: check.value },
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "datetime") {
					if (!datetimeRegex(check).test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.invalid_string,
							validation: "datetime",
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "date") {
					if (!dateRegex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.invalid_string,
							validation: "date",
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "time") {
					if (!timeRegex(check).test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.invalid_string,
							validation: "time",
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "duration") {
					if (!durationRegex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "duration",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "ip") {
					if (!isValidIP(input.data, check.version)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "ip",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "jwt") {
					if (!isValidJWT(input.data, check.alg)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "jwt",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "cidr") {
					if (!isValidCidr(input.data, check.version)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "cidr",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "base64") {
					if (!base64Regex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "base64",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "base64url") {
					if (!base64urlRegex.test(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							validation: "base64url",
							code: ZodIssueCode.invalid_string,
							message: check.message
						});
						status.dirty();
					}
				} else util.assertNever(check);
				return {
					status: status.value,
					value: input.data
				};
			}
			_regex(regex, validation, message) {
				return this.refinement((data) => regex.test(data), {
					validation,
					code: ZodIssueCode.invalid_string,
					...errorUtil.errToObj(message)
				});
			}
			_addCheck(check) {
				return new ZodString({
					...this._def,
					checks: [...this._def.checks, check]
				});
			}
			email(message) {
				return this._addCheck({
					kind: "email",
					...errorUtil.errToObj(message)
				});
			}
			url(message) {
				return this._addCheck({
					kind: "url",
					...errorUtil.errToObj(message)
				});
			}
			emoji(message) {
				return this._addCheck({
					kind: "emoji",
					...errorUtil.errToObj(message)
				});
			}
			uuid(message) {
				return this._addCheck({
					kind: "uuid",
					...errorUtil.errToObj(message)
				});
			}
			nanoid(message) {
				return this._addCheck({
					kind: "nanoid",
					...errorUtil.errToObj(message)
				});
			}
			cuid(message) {
				return this._addCheck({
					kind: "cuid",
					...errorUtil.errToObj(message)
				});
			}
			cuid2(message) {
				return this._addCheck({
					kind: "cuid2",
					...errorUtil.errToObj(message)
				});
			}
			ulid(message) {
				return this._addCheck({
					kind: "ulid",
					...errorUtil.errToObj(message)
				});
			}
			base64(message) {
				return this._addCheck({
					kind: "base64",
					...errorUtil.errToObj(message)
				});
			}
			base64url(message) {
				return this._addCheck({
					kind: "base64url",
					...errorUtil.errToObj(message)
				});
			}
			jwt(options) {
				return this._addCheck({
					kind: "jwt",
					...errorUtil.errToObj(options)
				});
			}
			ip(options) {
				return this._addCheck({
					kind: "ip",
					...errorUtil.errToObj(options)
				});
			}
			cidr(options) {
				return this._addCheck({
					kind: "cidr",
					...errorUtil.errToObj(options)
				});
			}
			datetime(options) {
				if (typeof options === "string") return this._addCheck({
					kind: "datetime",
					precision: null,
					offset: false,
					local: false,
					message: options
				});
				return this._addCheck({
					kind: "datetime",
					precision: typeof options?.precision === "undefined" ? null : options?.precision,
					offset: options?.offset ?? false,
					local: options?.local ?? false,
					...errorUtil.errToObj(options?.message)
				});
			}
			date(message) {
				return this._addCheck({
					kind: "date",
					message
				});
			}
			time(options) {
				if (typeof options === "string") return this._addCheck({
					kind: "time",
					precision: null,
					message: options
				});
				return this._addCheck({
					kind: "time",
					precision: typeof options?.precision === "undefined" ? null : options?.precision,
					...errorUtil.errToObj(options?.message)
				});
			}
			duration(message) {
				return this._addCheck({
					kind: "duration",
					...errorUtil.errToObj(message)
				});
			}
			regex(regex, message) {
				return this._addCheck({
					kind: "regex",
					regex,
					...errorUtil.errToObj(message)
				});
			}
			includes(value, options) {
				return this._addCheck({
					kind: "includes",
					value,
					position: options?.position,
					...errorUtil.errToObj(options?.message)
				});
			}
			startsWith(value, message) {
				return this._addCheck({
					kind: "startsWith",
					value,
					...errorUtil.errToObj(message)
				});
			}
			endsWith(value, message) {
				return this._addCheck({
					kind: "endsWith",
					value,
					...errorUtil.errToObj(message)
				});
			}
			min(minLength, message) {
				return this._addCheck({
					kind: "min",
					value: minLength,
					...errorUtil.errToObj(message)
				});
			}
			max(maxLength, message) {
				return this._addCheck({
					kind: "max",
					value: maxLength,
					...errorUtil.errToObj(message)
				});
			}
			length(len, message) {
				return this._addCheck({
					kind: "length",
					value: len,
					...errorUtil.errToObj(message)
				});
			}
			/**
			* Equivalent to `.min(1)`
			*/
			nonempty(message) {
				return this.min(1, errorUtil.errToObj(message));
			}
			trim() {
				return new ZodString({
					...this._def,
					checks: [...this._def.checks, { kind: "trim" }]
				});
			}
			toLowerCase() {
				return new ZodString({
					...this._def,
					checks: [...this._def.checks, { kind: "toLowerCase" }]
				});
			}
			toUpperCase() {
				return new ZodString({
					...this._def,
					checks: [...this._def.checks, { kind: "toUpperCase" }]
				});
			}
			get isDatetime() {
				return !!this._def.checks.find((ch) => ch.kind === "datetime");
			}
			get isDate() {
				return !!this._def.checks.find((ch) => ch.kind === "date");
			}
			get isTime() {
				return !!this._def.checks.find((ch) => ch.kind === "time");
			}
			get isDuration() {
				return !!this._def.checks.find((ch) => ch.kind === "duration");
			}
			get isEmail() {
				return !!this._def.checks.find((ch) => ch.kind === "email");
			}
			get isURL() {
				return !!this._def.checks.find((ch) => ch.kind === "url");
			}
			get isEmoji() {
				return !!this._def.checks.find((ch) => ch.kind === "emoji");
			}
			get isUUID() {
				return !!this._def.checks.find((ch) => ch.kind === "uuid");
			}
			get isNANOID() {
				return !!this._def.checks.find((ch) => ch.kind === "nanoid");
			}
			get isCUID() {
				return !!this._def.checks.find((ch) => ch.kind === "cuid");
			}
			get isCUID2() {
				return !!this._def.checks.find((ch) => ch.kind === "cuid2");
			}
			get isULID() {
				return !!this._def.checks.find((ch) => ch.kind === "ulid");
			}
			get isIP() {
				return !!this._def.checks.find((ch) => ch.kind === "ip");
			}
			get isCIDR() {
				return !!this._def.checks.find((ch) => ch.kind === "cidr");
			}
			get isBase64() {
				return !!this._def.checks.find((ch) => ch.kind === "base64");
			}
			get isBase64url() {
				return !!this._def.checks.find((ch) => ch.kind === "base64url");
			}
			get minLength() {
				let min = null;
				for (const ch of this._def.checks) if (ch.kind === "min") {
					if (min === null || ch.value > min) min = ch.value;
				}
				return min;
			}
			get maxLength() {
				let max = null;
				for (const ch of this._def.checks) if (ch.kind === "max") {
					if (max === null || ch.value < max) max = ch.value;
				}
				return max;
			}
		};
		ZodString.create = (params) => {
			return new ZodString({
				checks: [],
				typeName: ZodFirstPartyTypeKind.ZodString,
				coerce: params?.coerce ?? false,
				...processCreateParams(params)
			});
		};
		function floatSafeRemainder(val, step) {
			const valDecCount = (val.toString().split(".")[1] || "").length;
			const stepDecCount = (step.toString().split(".")[1] || "").length;
			const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
			return Number.parseInt(val.toFixed(decCount).replace(".", "")) % Number.parseInt(step.toFixed(decCount).replace(".", "")) / 10 ** decCount;
		}
		var ZodNumber = class ZodNumber extends ZodType {
			constructor() {
				super(...arguments);
				this.min = this.gte;
				this.max = this.lte;
				this.step = this.multipleOf;
			}
			_parse(input) {
				if (this._def.coerce) input.data = Number(input.data);
				if (this._getType(input) !== ZodParsedType.number) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.number,
						received: ctx.parsedType
					});
					return INVALID;
				}
				let ctx = void 0;
				const status = new ParseStatus();
				for (const check of this._def.checks) if (check.kind === "int") {
					if (!util.isInteger(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.invalid_type,
							expected: "integer",
							received: "float",
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "min") {
					if (check.inclusive ? input.data < check.value : input.data <= check.value) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_small,
							minimum: check.value,
							type: "number",
							inclusive: check.inclusive,
							exact: false,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "max") {
					if (check.inclusive ? input.data > check.value : input.data >= check.value) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_big,
							maximum: check.value,
							type: "number",
							inclusive: check.inclusive,
							exact: false,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "multipleOf") {
					if (floatSafeRemainder(input.data, check.value) !== 0) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.not_multiple_of,
							multipleOf: check.value,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "finite") {
					if (!Number.isFinite(input.data)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.not_finite,
							message: check.message
						});
						status.dirty();
					}
				} else util.assertNever(check);
				return {
					status: status.value,
					value: input.data
				};
			}
			gte(value, message) {
				return this.setLimit("min", value, true, errorUtil.toString(message));
			}
			gt(value, message) {
				return this.setLimit("min", value, false, errorUtil.toString(message));
			}
			lte(value, message) {
				return this.setLimit("max", value, true, errorUtil.toString(message));
			}
			lt(value, message) {
				return this.setLimit("max", value, false, errorUtil.toString(message));
			}
			setLimit(kind, value, inclusive, message) {
				return new ZodNumber({
					...this._def,
					checks: [...this._def.checks, {
						kind,
						value,
						inclusive,
						message: errorUtil.toString(message)
					}]
				});
			}
			_addCheck(check) {
				return new ZodNumber({
					...this._def,
					checks: [...this._def.checks, check]
				});
			}
			int(message) {
				return this._addCheck({
					kind: "int",
					message: errorUtil.toString(message)
				});
			}
			positive(message) {
				return this._addCheck({
					kind: "min",
					value: 0,
					inclusive: false,
					message: errorUtil.toString(message)
				});
			}
			negative(message) {
				return this._addCheck({
					kind: "max",
					value: 0,
					inclusive: false,
					message: errorUtil.toString(message)
				});
			}
			nonpositive(message) {
				return this._addCheck({
					kind: "max",
					value: 0,
					inclusive: true,
					message: errorUtil.toString(message)
				});
			}
			nonnegative(message) {
				return this._addCheck({
					kind: "min",
					value: 0,
					inclusive: true,
					message: errorUtil.toString(message)
				});
			}
			multipleOf(value, message) {
				return this._addCheck({
					kind: "multipleOf",
					value,
					message: errorUtil.toString(message)
				});
			}
			finite(message) {
				return this._addCheck({
					kind: "finite",
					message: errorUtil.toString(message)
				});
			}
			safe(message) {
				return this._addCheck({
					kind: "min",
					inclusive: true,
					value: Number.MIN_SAFE_INTEGER,
					message: errorUtil.toString(message)
				})._addCheck({
					kind: "max",
					inclusive: true,
					value: Number.MAX_SAFE_INTEGER,
					message: errorUtil.toString(message)
				});
			}
			get minValue() {
				let min = null;
				for (const ch of this._def.checks) if (ch.kind === "min") {
					if (min === null || ch.value > min) min = ch.value;
				}
				return min;
			}
			get maxValue() {
				let max = null;
				for (const ch of this._def.checks) if (ch.kind === "max") {
					if (max === null || ch.value < max) max = ch.value;
				}
				return max;
			}
			get isInt() {
				return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
			}
			get isFinite() {
				let max = null;
				let min = null;
				for (const ch of this._def.checks) if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") return true;
				else if (ch.kind === "min") {
					if (min === null || ch.value > min) min = ch.value;
				} else if (ch.kind === "max") {
					if (max === null || ch.value < max) max = ch.value;
				}
				return Number.isFinite(min) && Number.isFinite(max);
			}
		};
		ZodNumber.create = (params) => {
			return new ZodNumber({
				checks: [],
				typeName: ZodFirstPartyTypeKind.ZodNumber,
				coerce: params?.coerce || false,
				...processCreateParams(params)
			});
		};
		var ZodBigInt = class ZodBigInt extends ZodType {
			constructor() {
				super(...arguments);
				this.min = this.gte;
				this.max = this.lte;
			}
			_parse(input) {
				if (this._def.coerce) try {
					input.data = BigInt(input.data);
				} catch {
					return this._getInvalidInput(input);
				}
				if (this._getType(input) !== ZodParsedType.bigint) return this._getInvalidInput(input);
				let ctx = void 0;
				const status = new ParseStatus();
				for (const check of this._def.checks) if (check.kind === "min") {
					if (check.inclusive ? input.data < check.value : input.data <= check.value) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_small,
							type: "bigint",
							minimum: check.value,
							inclusive: check.inclusive,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "max") {
					if (check.inclusive ? input.data > check.value : input.data >= check.value) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_big,
							type: "bigint",
							maximum: check.value,
							inclusive: check.inclusive,
							message: check.message
						});
						status.dirty();
					}
				} else if (check.kind === "multipleOf") {
					if (input.data % check.value !== BigInt(0)) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.not_multiple_of,
							multipleOf: check.value,
							message: check.message
						});
						status.dirty();
					}
				} else util.assertNever(check);
				return {
					status: status.value,
					value: input.data
				};
			}
			_getInvalidInput(input) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.bigint,
					received: ctx.parsedType
				});
				return INVALID;
			}
			gte(value, message) {
				return this.setLimit("min", value, true, errorUtil.toString(message));
			}
			gt(value, message) {
				return this.setLimit("min", value, false, errorUtil.toString(message));
			}
			lte(value, message) {
				return this.setLimit("max", value, true, errorUtil.toString(message));
			}
			lt(value, message) {
				return this.setLimit("max", value, false, errorUtil.toString(message));
			}
			setLimit(kind, value, inclusive, message) {
				return new ZodBigInt({
					...this._def,
					checks: [...this._def.checks, {
						kind,
						value,
						inclusive,
						message: errorUtil.toString(message)
					}]
				});
			}
			_addCheck(check) {
				return new ZodBigInt({
					...this._def,
					checks: [...this._def.checks, check]
				});
			}
			positive(message) {
				return this._addCheck({
					kind: "min",
					value: BigInt(0),
					inclusive: false,
					message: errorUtil.toString(message)
				});
			}
			negative(message) {
				return this._addCheck({
					kind: "max",
					value: BigInt(0),
					inclusive: false,
					message: errorUtil.toString(message)
				});
			}
			nonpositive(message) {
				return this._addCheck({
					kind: "max",
					value: BigInt(0),
					inclusive: true,
					message: errorUtil.toString(message)
				});
			}
			nonnegative(message) {
				return this._addCheck({
					kind: "min",
					value: BigInt(0),
					inclusive: true,
					message: errorUtil.toString(message)
				});
			}
			multipleOf(value, message) {
				return this._addCheck({
					kind: "multipleOf",
					value,
					message: errorUtil.toString(message)
				});
			}
			get minValue() {
				let min = null;
				for (const ch of this._def.checks) if (ch.kind === "min") {
					if (min === null || ch.value > min) min = ch.value;
				}
				return min;
			}
			get maxValue() {
				let max = null;
				for (const ch of this._def.checks) if (ch.kind === "max") {
					if (max === null || ch.value < max) max = ch.value;
				}
				return max;
			}
		};
		ZodBigInt.create = (params) => {
			return new ZodBigInt({
				checks: [],
				typeName: ZodFirstPartyTypeKind.ZodBigInt,
				coerce: params?.coerce ?? false,
				...processCreateParams(params)
			});
		};
		var ZodBoolean = class extends ZodType {
			_parse(input) {
				if (this._def.coerce) input.data = Boolean(input.data);
				if (this._getType(input) !== ZodParsedType.boolean) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.boolean,
						received: ctx.parsedType
					});
					return INVALID;
				}
				return OK(input.data);
			}
		};
		ZodBoolean.create = (params) => {
			return new ZodBoolean({
				typeName: ZodFirstPartyTypeKind.ZodBoolean,
				coerce: params?.coerce || false,
				...processCreateParams(params)
			});
		};
		var ZodDate = class ZodDate extends ZodType {
			_parse(input) {
				if (this._def.coerce) input.data = new Date(input.data);
				if (this._getType(input) !== ZodParsedType.date) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.date,
						received: ctx.parsedType
					});
					return INVALID;
				}
				if (Number.isNaN(input.data.getTime())) {
					addIssueToContext(this._getOrReturnCtx(input), { code: ZodIssueCode.invalid_date });
					return INVALID;
				}
				const status = new ParseStatus();
				let ctx = void 0;
				for (const check of this._def.checks) if (check.kind === "min") {
					if (input.data.getTime() < check.value) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_small,
							message: check.message,
							inclusive: true,
							exact: false,
							minimum: check.value,
							type: "date"
						});
						status.dirty();
					}
				} else if (check.kind === "max") {
					if (input.data.getTime() > check.value) {
						ctx = this._getOrReturnCtx(input, ctx);
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_big,
							message: check.message,
							inclusive: true,
							exact: false,
							maximum: check.value,
							type: "date"
						});
						status.dirty();
					}
				} else util.assertNever(check);
				return {
					status: status.value,
					value: new Date(input.data.getTime())
				};
			}
			_addCheck(check) {
				return new ZodDate({
					...this._def,
					checks: [...this._def.checks, check]
				});
			}
			min(minDate, message) {
				return this._addCheck({
					kind: "min",
					value: minDate.getTime(),
					message: errorUtil.toString(message)
				});
			}
			max(maxDate, message) {
				return this._addCheck({
					kind: "max",
					value: maxDate.getTime(),
					message: errorUtil.toString(message)
				});
			}
			get minDate() {
				let min = null;
				for (const ch of this._def.checks) if (ch.kind === "min") {
					if (min === null || ch.value > min) min = ch.value;
				}
				return min != null ? new Date(min) : null;
			}
			get maxDate() {
				let max = null;
				for (const ch of this._def.checks) if (ch.kind === "max") {
					if (max === null || ch.value < max) max = ch.value;
				}
				return max != null ? new Date(max) : null;
			}
		};
		ZodDate.create = (params) => {
			return new ZodDate({
				checks: [],
				coerce: params?.coerce || false,
				typeName: ZodFirstPartyTypeKind.ZodDate,
				...processCreateParams(params)
			});
		};
		var ZodSymbol = class extends ZodType {
			_parse(input) {
				if (this._getType(input) !== ZodParsedType.symbol) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.symbol,
						received: ctx.parsedType
					});
					return INVALID;
				}
				return OK(input.data);
			}
		};
		ZodSymbol.create = (params) => {
			return new ZodSymbol({
				typeName: ZodFirstPartyTypeKind.ZodSymbol,
				...processCreateParams(params)
			});
		};
		var ZodUndefined = class extends ZodType {
			_parse(input) {
				if (this._getType(input) !== ZodParsedType.undefined) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.undefined,
						received: ctx.parsedType
					});
					return INVALID;
				}
				return OK(input.data);
			}
		};
		ZodUndefined.create = (params) => {
			return new ZodUndefined({
				typeName: ZodFirstPartyTypeKind.ZodUndefined,
				...processCreateParams(params)
			});
		};
		var ZodNull = class extends ZodType {
			_parse(input) {
				if (this._getType(input) !== ZodParsedType.null) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.null,
						received: ctx.parsedType
					});
					return INVALID;
				}
				return OK(input.data);
			}
		};
		ZodNull.create = (params) => {
			return new ZodNull({
				typeName: ZodFirstPartyTypeKind.ZodNull,
				...processCreateParams(params)
			});
		};
		var ZodAny = class extends ZodType {
			constructor() {
				super(...arguments);
				this._any = true;
			}
			_parse(input) {
				return OK(input.data);
			}
		};
		ZodAny.create = (params) => {
			return new ZodAny({
				typeName: ZodFirstPartyTypeKind.ZodAny,
				...processCreateParams(params)
			});
		};
		var ZodUnknown = class extends ZodType {
			constructor() {
				super(...arguments);
				this._unknown = true;
			}
			_parse(input) {
				return OK(input.data);
			}
		};
		ZodUnknown.create = (params) => {
			return new ZodUnknown({
				typeName: ZodFirstPartyTypeKind.ZodUnknown,
				...processCreateParams(params)
			});
		};
		var ZodNever = class extends ZodType {
			_parse(input) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.never,
					received: ctx.parsedType
				});
				return INVALID;
			}
		};
		ZodNever.create = (params) => {
			return new ZodNever({
				typeName: ZodFirstPartyTypeKind.ZodNever,
				...processCreateParams(params)
			});
		};
		var ZodVoid = class extends ZodType {
			_parse(input) {
				if (this._getType(input) !== ZodParsedType.undefined) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.void,
						received: ctx.parsedType
					});
					return INVALID;
				}
				return OK(input.data);
			}
		};
		ZodVoid.create = (params) => {
			return new ZodVoid({
				typeName: ZodFirstPartyTypeKind.ZodVoid,
				...processCreateParams(params)
			});
		};
		var ZodArray = class ZodArray extends ZodType {
			_parse(input) {
				const { ctx, status } = this._processInputParams(input);
				const def = this._def;
				if (ctx.parsedType !== ZodParsedType.array) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.array,
						received: ctx.parsedType
					});
					return INVALID;
				}
				if (def.exactLength !== null) {
					const tooBig = ctx.data.length > def.exactLength.value;
					const tooSmall = ctx.data.length < def.exactLength.value;
					if (tooBig || tooSmall) {
						addIssueToContext(ctx, {
							code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
							minimum: tooSmall ? def.exactLength.value : void 0,
							maximum: tooBig ? def.exactLength.value : void 0,
							type: "array",
							inclusive: true,
							exact: true,
							message: def.exactLength.message
						});
						status.dirty();
					}
				}
				if (def.minLength !== null) {
					if (ctx.data.length < def.minLength.value) {
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_small,
							minimum: def.minLength.value,
							type: "array",
							inclusive: true,
							exact: false,
							message: def.minLength.message
						});
						status.dirty();
					}
				}
				if (def.maxLength !== null) {
					if (ctx.data.length > def.maxLength.value) {
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_big,
							maximum: def.maxLength.value,
							type: "array",
							inclusive: true,
							exact: false,
							message: def.maxLength.message
						});
						status.dirty();
					}
				}
				if (ctx.common.async) return Promise.all([...ctx.data].map((item, i) => {
					return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
				})).then((result) => {
					return ParseStatus.mergeArray(status, result);
				});
				const result = [...ctx.data].map((item, i) => {
					return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
				});
				return ParseStatus.mergeArray(status, result);
			}
			get element() {
				return this._def.type;
			}
			min(minLength, message) {
				return new ZodArray({
					...this._def,
					minLength: {
						value: minLength,
						message: errorUtil.toString(message)
					}
				});
			}
			max(maxLength, message) {
				return new ZodArray({
					...this._def,
					maxLength: {
						value: maxLength,
						message: errorUtil.toString(message)
					}
				});
			}
			length(len, message) {
				return new ZodArray({
					...this._def,
					exactLength: {
						value: len,
						message: errorUtil.toString(message)
					}
				});
			}
			nonempty(message) {
				return this.min(1, message);
			}
		};
		ZodArray.create = (schema, params) => {
			return new ZodArray({
				type: schema,
				minLength: null,
				maxLength: null,
				exactLength: null,
				typeName: ZodFirstPartyTypeKind.ZodArray,
				...processCreateParams(params)
			});
		};
		function deepPartialify(schema) {
			if (schema instanceof ZodObject) {
				const newShape = {};
				for (const key in schema.shape) {
					const fieldSchema = schema.shape[key];
					newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
				}
				return new ZodObject({
					...schema._def,
					shape: () => newShape
				});
			} else if (schema instanceof ZodArray) return new ZodArray({
				...schema._def,
				type: deepPartialify(schema.element)
			});
			else if (schema instanceof ZodOptional) return ZodOptional.create(deepPartialify(schema.unwrap()));
			else if (schema instanceof ZodNullable) return ZodNullable.create(deepPartialify(schema.unwrap()));
			else if (schema instanceof ZodTuple) return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
			else return schema;
		}
		var ZodObject = class ZodObject extends ZodType {
			constructor() {
				super(...arguments);
				this._cached = null;
				/**
				* @deprecated In most cases, this is no longer needed - unknown properties are now silently stripped.
				* If you want to pass through unknown properties, use `.passthrough()` instead.
				*/
				this.nonstrict = this.passthrough;
				/**
				* @deprecated Use `.extend` instead
				*  */
				this.augment = this.extend;
			}
			_getCached() {
				if (this._cached !== null) return this._cached;
				const shape = this._def.shape();
				const keys = util.objectKeys(shape);
				this._cached = {
					shape,
					keys
				};
				return this._cached;
			}
			_parse(input) {
				if (this._getType(input) !== ZodParsedType.object) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.object,
						received: ctx.parsedType
					});
					return INVALID;
				}
				const { status, ctx } = this._processInputParams(input);
				const { shape, keys: shapeKeys } = this._getCached();
				const extraKeys = [];
				if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
					for (const key in ctx.data) if (!shapeKeys.includes(key)) extraKeys.push(key);
				}
				const pairs = [];
				for (const key of shapeKeys) {
					const keyValidator = shape[key];
					const value = ctx.data[key];
					pairs.push({
						key: {
							status: "valid",
							value: key
						},
						value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
						alwaysSet: key in ctx.data
					});
				}
				if (this._def.catchall instanceof ZodNever) {
					const unknownKeys = this._def.unknownKeys;
					if (unknownKeys === "passthrough") for (const key of extraKeys) pairs.push({
						key: {
							status: "valid",
							value: key
						},
						value: {
							status: "valid",
							value: ctx.data[key]
						}
					});
					else if (unknownKeys === "strict") {
						if (extraKeys.length > 0) {
							addIssueToContext(ctx, {
								code: ZodIssueCode.unrecognized_keys,
								keys: extraKeys
							});
							status.dirty();
						}
					} else if (unknownKeys === "strip") {} else throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
				} else {
					const catchall = this._def.catchall;
					for (const key of extraKeys) {
						const value = ctx.data[key];
						pairs.push({
							key: {
								status: "valid",
								value: key
							},
							value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
							alwaysSet: key in ctx.data
						});
					}
				}
				if (ctx.common.async) return Promise.resolve().then(async () => {
					const syncPairs = [];
					for (const pair of pairs) {
						const key = await pair.key;
						const value = await pair.value;
						syncPairs.push({
							key,
							value,
							alwaysSet: pair.alwaysSet
						});
					}
					return syncPairs;
				}).then((syncPairs) => {
					return ParseStatus.mergeObjectSync(status, syncPairs);
				});
				else return ParseStatus.mergeObjectSync(status, pairs);
			}
			get shape() {
				return this._def.shape();
			}
			strict(message) {
				errorUtil.errToObj;
				return new ZodObject({
					...this._def,
					unknownKeys: "strict",
					...message !== void 0 ? { errorMap: (issue, ctx) => {
						const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
						if (issue.code === "unrecognized_keys") return { message: errorUtil.errToObj(message).message ?? defaultError };
						return { message: defaultError };
					} } : {}
				});
			}
			strip() {
				return new ZodObject({
					...this._def,
					unknownKeys: "strip"
				});
			}
			passthrough() {
				return new ZodObject({
					...this._def,
					unknownKeys: "passthrough"
				});
			}
			extend(augmentation) {
				return new ZodObject({
					...this._def,
					shape: () => ({
						...this._def.shape(),
						...augmentation
					})
				});
			}
			/**
			* Prior to zod@1.0.12 there was a bug in the
			* inferred type of merged objects. Please
			* upgrade if you are experiencing issues.
			*/
			merge(merging) {
				return new ZodObject({
					unknownKeys: merging._def.unknownKeys,
					catchall: merging._def.catchall,
					shape: () => ({
						...this._def.shape(),
						...merging._def.shape()
					}),
					typeName: ZodFirstPartyTypeKind.ZodObject
				});
			}
			setKey(key, schema) {
				return this.augment({ [key]: schema });
			}
			catchall(index) {
				return new ZodObject({
					...this._def,
					catchall: index
				});
			}
			pick(mask) {
				const shape = {};
				for (const key of util.objectKeys(mask)) if (mask[key] && this.shape[key]) shape[key] = this.shape[key];
				return new ZodObject({
					...this._def,
					shape: () => shape
				});
			}
			omit(mask) {
				const shape = {};
				for (const key of util.objectKeys(this.shape)) if (!mask[key]) shape[key] = this.shape[key];
				return new ZodObject({
					...this._def,
					shape: () => shape
				});
			}
			/**
			* @deprecated
			*/
			deepPartial() {
				return deepPartialify(this);
			}
			partial(mask) {
				const newShape = {};
				for (const key of util.objectKeys(this.shape)) {
					const fieldSchema = this.shape[key];
					if (mask && !mask[key]) newShape[key] = fieldSchema;
					else newShape[key] = fieldSchema.optional();
				}
				return new ZodObject({
					...this._def,
					shape: () => newShape
				});
			}
			required(mask) {
				const newShape = {};
				for (const key of util.objectKeys(this.shape)) if (mask && !mask[key]) newShape[key] = this.shape[key];
				else {
					let newField = this.shape[key];
					while (newField instanceof ZodOptional) newField = newField._def.innerType;
					newShape[key] = newField;
				}
				return new ZodObject({
					...this._def,
					shape: () => newShape
				});
			}
			keyof() {
				return createZodEnum(util.objectKeys(this.shape));
			}
		};
		ZodObject.create = (shape, params) => {
			return new ZodObject({
				shape: () => shape,
				unknownKeys: "strip",
				catchall: ZodNever.create(),
				typeName: ZodFirstPartyTypeKind.ZodObject,
				...processCreateParams(params)
			});
		};
		ZodObject.strictCreate = (shape, params) => {
			return new ZodObject({
				shape: () => shape,
				unknownKeys: "strict",
				catchall: ZodNever.create(),
				typeName: ZodFirstPartyTypeKind.ZodObject,
				...processCreateParams(params)
			});
		};
		ZodObject.lazycreate = (shape, params) => {
			return new ZodObject({
				shape,
				unknownKeys: "strip",
				catchall: ZodNever.create(),
				typeName: ZodFirstPartyTypeKind.ZodObject,
				...processCreateParams(params)
			});
		};
		var ZodUnion = class extends ZodType {
			_parse(input) {
				const { ctx } = this._processInputParams(input);
				const options = this._def.options;
				function handleResults(results) {
					for (const result of results) if (result.result.status === "valid") return result.result;
					for (const result of results) if (result.result.status === "dirty") {
						ctx.common.issues.push(...result.ctx.common.issues);
						return result.result;
					}
					const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_union,
						unionErrors
					});
					return INVALID;
				}
				if (ctx.common.async) return Promise.all(options.map(async (option) => {
					const childCtx = {
						...ctx,
						common: {
							...ctx.common,
							issues: []
						},
						parent: null
					};
					return {
						result: await option._parseAsync({
							data: ctx.data,
							path: ctx.path,
							parent: childCtx
						}),
						ctx: childCtx
					};
				})).then(handleResults);
				else {
					let dirty = void 0;
					const issues = [];
					for (const option of options) {
						const childCtx = {
							...ctx,
							common: {
								...ctx.common,
								issues: []
							},
							parent: null
						};
						const result = option._parseSync({
							data: ctx.data,
							path: ctx.path,
							parent: childCtx
						});
						if (result.status === "valid") return result;
						else if (result.status === "dirty" && !dirty) dirty = {
							result,
							ctx: childCtx
						};
						if (childCtx.common.issues.length) issues.push(childCtx.common.issues);
					}
					if (dirty) {
						ctx.common.issues.push(...dirty.ctx.common.issues);
						return dirty.result;
					}
					const unionErrors = issues.map((issues) => new ZodError(issues));
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_union,
						unionErrors
					});
					return INVALID;
				}
			}
			get options() {
				return this._def.options;
			}
		};
		ZodUnion.create = (types, params) => {
			return new ZodUnion({
				options: types,
				typeName: ZodFirstPartyTypeKind.ZodUnion,
				...processCreateParams(params)
			});
		};
		const getDiscriminator = (type) => {
			if (type instanceof ZodLazy) return getDiscriminator(type.schema);
			else if (type instanceof ZodEffects) return getDiscriminator(type.innerType());
			else if (type instanceof ZodLiteral) return [type.value];
			else if (type instanceof ZodEnum) return type.options;
			else if (type instanceof ZodNativeEnum) return util.objectValues(type.enum);
			else if (type instanceof ZodDefault) return getDiscriminator(type._def.innerType);
			else if (type instanceof ZodUndefined) return [void 0];
			else if (type instanceof ZodNull) return [null];
			else if (type instanceof ZodOptional) return [void 0, ...getDiscriminator(type.unwrap())];
			else if (type instanceof ZodNullable) return [null, ...getDiscriminator(type.unwrap())];
			else if (type instanceof ZodBranded) return getDiscriminator(type.unwrap());
			else if (type instanceof ZodReadonly) return getDiscriminator(type.unwrap());
			else if (type instanceof ZodCatch) return getDiscriminator(type._def.innerType);
			else return [];
		};
		var ZodDiscriminatedUnion = class ZodDiscriminatedUnion extends ZodType {
			_parse(input) {
				const { ctx } = this._processInputParams(input);
				if (ctx.parsedType !== ZodParsedType.object) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.object,
						received: ctx.parsedType
					});
					return INVALID;
				}
				const discriminator = this.discriminator;
				const discriminatorValue = ctx.data[discriminator];
				const option = this.optionsMap.get(discriminatorValue);
				if (!option) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_union_discriminator,
						options: Array.from(this.optionsMap.keys()),
						path: [discriminator]
					});
					return INVALID;
				}
				if (ctx.common.async) return option._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				});
				else return option._parseSync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				});
			}
			get discriminator() {
				return this._def.discriminator;
			}
			get options() {
				return this._def.options;
			}
			get optionsMap() {
				return this._def.optionsMap;
			}
			/**
			* The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
			* However, it only allows a union of objects, all of which need to share a discriminator property. This property must
			* have a different value for each object in the union.
			* @param discriminator the name of the discriminator property
			* @param types an array of object schemas
			* @param params
			*/
			static create(discriminator, options, params) {
				const optionsMap = /* @__PURE__ */ new Map();
				for (const type of options) {
					const discriminatorValues = getDiscriminator(type.shape[discriminator]);
					if (!discriminatorValues.length) throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
					for (const value of discriminatorValues) {
						if (optionsMap.has(value)) throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
						optionsMap.set(value, type);
					}
				}
				return new ZodDiscriminatedUnion({
					typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
					discriminator,
					options,
					optionsMap,
					...processCreateParams(params)
				});
			}
		};
		function mergeValues(a, b) {
			const aType = getParsedType(a);
			const bType = getParsedType(b);
			if (a === b) return {
				valid: true,
				data: a
			};
			else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
				const bKeys = util.objectKeys(b);
				const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
				const newObj = {
					...a,
					...b
				};
				for (const key of sharedKeys) {
					const sharedValue = mergeValues(a[key], b[key]);
					if (!sharedValue.valid) return { valid: false };
					newObj[key] = sharedValue.data;
				}
				return {
					valid: true,
					data: newObj
				};
			} else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
				if (a.length !== b.length) return { valid: false };
				const newArray = [];
				for (let index = 0; index < a.length; index++) {
					const itemA = a[index];
					const itemB = b[index];
					const sharedValue = mergeValues(itemA, itemB);
					if (!sharedValue.valid) return { valid: false };
					newArray.push(sharedValue.data);
				}
				return {
					valid: true,
					data: newArray
				};
			} else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) return {
				valid: true,
				data: a
			};
			else return { valid: false };
		}
		var ZodIntersection = class extends ZodType {
			_parse(input) {
				const { status, ctx } = this._processInputParams(input);
				const handleParsed = (parsedLeft, parsedRight) => {
					if (isAborted(parsedLeft) || isAborted(parsedRight)) return INVALID;
					const merged = mergeValues(parsedLeft.value, parsedRight.value);
					if (!merged.valid) {
						addIssueToContext(ctx, { code: ZodIssueCode.invalid_intersection_types });
						return INVALID;
					}
					if (isDirty(parsedLeft) || isDirty(parsedRight)) status.dirty();
					return {
						status: status.value,
						value: merged.data
					};
				};
				if (ctx.common.async) return Promise.all([this._def.left._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				}), this._def.right._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				})]).then(([left, right]) => handleParsed(left, right));
				else return handleParsed(this._def.left._parseSync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				}), this._def.right._parseSync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				}));
			}
		};
		ZodIntersection.create = (left, right, params) => {
			return new ZodIntersection({
				left,
				right,
				typeName: ZodFirstPartyTypeKind.ZodIntersection,
				...processCreateParams(params)
			});
		};
		var ZodTuple = class ZodTuple extends ZodType {
			_parse(input) {
				const { status, ctx } = this._processInputParams(input);
				if (ctx.parsedType !== ZodParsedType.array) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.array,
						received: ctx.parsedType
					});
					return INVALID;
				}
				if (ctx.data.length < this._def.items.length) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: this._def.items.length,
						inclusive: true,
						exact: false,
						type: "array"
					});
					return INVALID;
				}
				if (!this._def.rest && ctx.data.length > this._def.items.length) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: this._def.items.length,
						inclusive: true,
						exact: false,
						type: "array"
					});
					status.dirty();
				}
				const items = [...ctx.data].map((item, itemIndex) => {
					const schema = this._def.items[itemIndex] || this._def.rest;
					if (!schema) return null;
					return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
				}).filter((x) => !!x);
				if (ctx.common.async) return Promise.all(items).then((results) => {
					return ParseStatus.mergeArray(status, results);
				});
				else return ParseStatus.mergeArray(status, items);
			}
			get items() {
				return this._def.items;
			}
			rest(rest) {
				return new ZodTuple({
					...this._def,
					rest
				});
			}
		};
		ZodTuple.create = (schemas, params) => {
			if (!Array.isArray(schemas)) throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
			return new ZodTuple({
				items: schemas,
				typeName: ZodFirstPartyTypeKind.ZodTuple,
				rest: null,
				...processCreateParams(params)
			});
		};
		var ZodRecord = class ZodRecord extends ZodType {
			get keySchema() {
				return this._def.keyType;
			}
			get valueSchema() {
				return this._def.valueType;
			}
			_parse(input) {
				const { status, ctx } = this._processInputParams(input);
				if (ctx.parsedType !== ZodParsedType.object) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.object,
						received: ctx.parsedType
					});
					return INVALID;
				}
				const pairs = [];
				const keyType = this._def.keyType;
				const valueType = this._def.valueType;
				for (const key in ctx.data) pairs.push({
					key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
					value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
					alwaysSet: key in ctx.data
				});
				if (ctx.common.async) return ParseStatus.mergeObjectAsync(status, pairs);
				else return ParseStatus.mergeObjectSync(status, pairs);
			}
			get element() {
				return this._def.valueType;
			}
			static create(first, second, third) {
				if (second instanceof ZodType) return new ZodRecord({
					keyType: first,
					valueType: second,
					typeName: ZodFirstPartyTypeKind.ZodRecord,
					...processCreateParams(third)
				});
				return new ZodRecord({
					keyType: ZodString.create(),
					valueType: first,
					typeName: ZodFirstPartyTypeKind.ZodRecord,
					...processCreateParams(second)
				});
			}
		};
		var ZodMap = class extends ZodType {
			get keySchema() {
				return this._def.keyType;
			}
			get valueSchema() {
				return this._def.valueType;
			}
			_parse(input) {
				const { status, ctx } = this._processInputParams(input);
				if (ctx.parsedType !== ZodParsedType.map) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.map,
						received: ctx.parsedType
					});
					return INVALID;
				}
				const keyType = this._def.keyType;
				const valueType = this._def.valueType;
				const pairs = [...ctx.data.entries()].map(([key, value], index) => {
					return {
						key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
						value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
					};
				});
				if (ctx.common.async) {
					const finalMap = /* @__PURE__ */ new Map();
					return Promise.resolve().then(async () => {
						for (const pair of pairs) {
							const key = await pair.key;
							const value = await pair.value;
							if (key.status === "aborted" || value.status === "aborted") return INVALID;
							if (key.status === "dirty" || value.status === "dirty") status.dirty();
							finalMap.set(key.value, value.value);
						}
						return {
							status: status.value,
							value: finalMap
						};
					});
				} else {
					const finalMap = /* @__PURE__ */ new Map();
					for (const pair of pairs) {
						const key = pair.key;
						const value = pair.value;
						if (key.status === "aborted" || value.status === "aborted") return INVALID;
						if (key.status === "dirty" || value.status === "dirty") status.dirty();
						finalMap.set(key.value, value.value);
					}
					return {
						status: status.value,
						value: finalMap
					};
				}
			}
		};
		ZodMap.create = (keyType, valueType, params) => {
			return new ZodMap({
				valueType,
				keyType,
				typeName: ZodFirstPartyTypeKind.ZodMap,
				...processCreateParams(params)
			});
		};
		var ZodSet = class ZodSet extends ZodType {
			_parse(input) {
				const { status, ctx } = this._processInputParams(input);
				if (ctx.parsedType !== ZodParsedType.set) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.set,
						received: ctx.parsedType
					});
					return INVALID;
				}
				const def = this._def;
				if (def.minSize !== null) {
					if (ctx.data.size < def.minSize.value) {
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_small,
							minimum: def.minSize.value,
							type: "set",
							inclusive: true,
							exact: false,
							message: def.minSize.message
						});
						status.dirty();
					}
				}
				if (def.maxSize !== null) {
					if (ctx.data.size > def.maxSize.value) {
						addIssueToContext(ctx, {
							code: ZodIssueCode.too_big,
							maximum: def.maxSize.value,
							type: "set",
							inclusive: true,
							exact: false,
							message: def.maxSize.message
						});
						status.dirty();
					}
				}
				const valueType = this._def.valueType;
				function finalizeSet(elements) {
					const parsedSet = /* @__PURE__ */ new Set();
					for (const element of elements) {
						if (element.status === "aborted") return INVALID;
						if (element.status === "dirty") status.dirty();
						parsedSet.add(element.value);
					}
					return {
						status: status.value,
						value: parsedSet
					};
				}
				const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
				if (ctx.common.async) return Promise.all(elements).then((elements) => finalizeSet(elements));
				else return finalizeSet(elements);
			}
			min(minSize, message) {
				return new ZodSet({
					...this._def,
					minSize: {
						value: minSize,
						message: errorUtil.toString(message)
					}
				});
			}
			max(maxSize, message) {
				return new ZodSet({
					...this._def,
					maxSize: {
						value: maxSize,
						message: errorUtil.toString(message)
					}
				});
			}
			size(size, message) {
				return this.min(size, message).max(size, message);
			}
			nonempty(message) {
				return this.min(1, message);
			}
		};
		ZodSet.create = (valueType, params) => {
			return new ZodSet({
				valueType,
				minSize: null,
				maxSize: null,
				typeName: ZodFirstPartyTypeKind.ZodSet,
				...processCreateParams(params)
			});
		};
		var ZodFunction = class ZodFunction extends ZodType {
			constructor() {
				super(...arguments);
				this.validate = this.implement;
			}
			_parse(input) {
				const { ctx } = this._processInputParams(input);
				if (ctx.parsedType !== ZodParsedType.function) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.function,
						received: ctx.parsedType
					});
					return INVALID;
				}
				function makeArgsIssue(args, error) {
					return makeIssue({
						data: args,
						path: ctx.path,
						errorMaps: [
							ctx.common.contextualErrorMap,
							ctx.schemaErrorMap,
							getErrorMap(),
							errorMap
						].filter((x) => !!x),
						issueData: {
							code: ZodIssueCode.invalid_arguments,
							argumentsError: error
						}
					});
				}
				function makeReturnsIssue(returns, error) {
					return makeIssue({
						data: returns,
						path: ctx.path,
						errorMaps: [
							ctx.common.contextualErrorMap,
							ctx.schemaErrorMap,
							getErrorMap(),
							errorMap
						].filter((x) => !!x),
						issueData: {
							code: ZodIssueCode.invalid_return_type,
							returnTypeError: error
						}
					});
				}
				const params = { errorMap: ctx.common.contextualErrorMap };
				const fn = ctx.data;
				if (this._def.returns instanceof ZodPromise) {
					const me = this;
					return OK(async function(...args) {
						const error = new ZodError([]);
						const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
							error.addIssue(makeArgsIssue(args, e));
							throw error;
						});
						const result = await Reflect.apply(fn, this, parsedArgs);
						return await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
							error.addIssue(makeReturnsIssue(result, e));
							throw error;
						});
					});
				} else {
					const me = this;
					return OK(function(...args) {
						const parsedArgs = me._def.args.safeParse(args, params);
						if (!parsedArgs.success) throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
						const result = Reflect.apply(fn, this, parsedArgs.data);
						const parsedReturns = me._def.returns.safeParse(result, params);
						if (!parsedReturns.success) throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
						return parsedReturns.data;
					});
				}
			}
			parameters() {
				return this._def.args;
			}
			returnType() {
				return this._def.returns;
			}
			args(...items) {
				return new ZodFunction({
					...this._def,
					args: ZodTuple.create(items).rest(ZodUnknown.create())
				});
			}
			returns(returnType) {
				return new ZodFunction({
					...this._def,
					returns: returnType
				});
			}
			implement(func) {
				return this.parse(func);
			}
			strictImplement(func) {
				return this.parse(func);
			}
			static create(args, returns, params) {
				return new ZodFunction({
					args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
					returns: returns || ZodUnknown.create(),
					typeName: ZodFirstPartyTypeKind.ZodFunction,
					...processCreateParams(params)
				});
			}
		};
		var ZodLazy = class extends ZodType {
			get schema() {
				return this._def.getter();
			}
			_parse(input) {
				const { ctx } = this._processInputParams(input);
				return this._def.getter()._parse({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				});
			}
		};
		ZodLazy.create = (getter, params) => {
			return new ZodLazy({
				getter,
				typeName: ZodFirstPartyTypeKind.ZodLazy,
				...processCreateParams(params)
			});
		};
		var ZodLiteral = class extends ZodType {
			_parse(input) {
				if (input.data !== this._def.value) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						received: ctx.data,
						code: ZodIssueCode.invalid_literal,
						expected: this._def.value
					});
					return INVALID;
				}
				return {
					status: "valid",
					value: input.data
				};
			}
			get value() {
				return this._def.value;
			}
		};
		ZodLiteral.create = (value, params) => {
			return new ZodLiteral({
				value,
				typeName: ZodFirstPartyTypeKind.ZodLiteral,
				...processCreateParams(params)
			});
		};
		function createZodEnum(values, params) {
			return new ZodEnum({
				values,
				typeName: ZodFirstPartyTypeKind.ZodEnum,
				...processCreateParams(params)
			});
		}
		var ZodEnum = class ZodEnum extends ZodType {
			_parse(input) {
				if (typeof input.data !== "string") {
					const ctx = this._getOrReturnCtx(input);
					const expectedValues = this._def.values;
					addIssueToContext(ctx, {
						expected: util.joinValues(expectedValues),
						received: ctx.parsedType,
						code: ZodIssueCode.invalid_type
					});
					return INVALID;
				}
				if (!this._cache) this._cache = new Set(this._def.values);
				if (!this._cache.has(input.data)) {
					const ctx = this._getOrReturnCtx(input);
					const expectedValues = this._def.values;
					addIssueToContext(ctx, {
						received: ctx.data,
						code: ZodIssueCode.invalid_enum_value,
						options: expectedValues
					});
					return INVALID;
				}
				return OK(input.data);
			}
			get options() {
				return this._def.values;
			}
			get enum() {
				const enumValues = {};
				for (const val of this._def.values) enumValues[val] = val;
				return enumValues;
			}
			get Values() {
				const enumValues = {};
				for (const val of this._def.values) enumValues[val] = val;
				return enumValues;
			}
			get Enum() {
				const enumValues = {};
				for (const val of this._def.values) enumValues[val] = val;
				return enumValues;
			}
			extract(values, newDef = this._def) {
				return ZodEnum.create(values, {
					...this._def,
					...newDef
				});
			}
			exclude(values, newDef = this._def) {
				return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
					...this._def,
					...newDef
				});
			}
		};
		ZodEnum.create = createZodEnum;
		var ZodNativeEnum = class extends ZodType {
			_parse(input) {
				const nativeEnumValues = util.getValidEnumValues(this._def.values);
				const ctx = this._getOrReturnCtx(input);
				if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
					const expectedValues = util.objectValues(nativeEnumValues);
					addIssueToContext(ctx, {
						expected: util.joinValues(expectedValues),
						received: ctx.parsedType,
						code: ZodIssueCode.invalid_type
					});
					return INVALID;
				}
				if (!this._cache) this._cache = new Set(util.getValidEnumValues(this._def.values));
				if (!this._cache.has(input.data)) {
					const expectedValues = util.objectValues(nativeEnumValues);
					addIssueToContext(ctx, {
						received: ctx.data,
						code: ZodIssueCode.invalid_enum_value,
						options: expectedValues
					});
					return INVALID;
				}
				return OK(input.data);
			}
			get enum() {
				return this._def.values;
			}
		};
		ZodNativeEnum.create = (values, params) => {
			return new ZodNativeEnum({
				values,
				typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
				...processCreateParams(params)
			});
		};
		var ZodPromise = class extends ZodType {
			unwrap() {
				return this._def.type;
			}
			_parse(input) {
				const { ctx } = this._processInputParams(input);
				if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.promise,
						received: ctx.parsedType
					});
					return INVALID;
				}
				const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
				return OK(promisified.then((data) => {
					return this._def.type.parseAsync(data, {
						path: ctx.path,
						errorMap: ctx.common.contextualErrorMap
					});
				}));
			}
		};
		ZodPromise.create = (schema, params) => {
			return new ZodPromise({
				type: schema,
				typeName: ZodFirstPartyTypeKind.ZodPromise,
				...processCreateParams(params)
			});
		};
		var ZodEffects = class extends ZodType {
			innerType() {
				return this._def.schema;
			}
			sourceType() {
				return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
			}
			_parse(input) {
				const { status, ctx } = this._processInputParams(input);
				const effect = this._def.effect || null;
				const checkCtx = {
					addIssue: (arg) => {
						addIssueToContext(ctx, arg);
						if (arg.fatal) status.abort();
						else status.dirty();
					},
					get path() {
						return ctx.path;
					}
				};
				checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
				if (effect.type === "preprocess") {
					const processed = effect.transform(ctx.data, checkCtx);
					if (ctx.common.async) return Promise.resolve(processed).then(async (processed) => {
						if (status.value === "aborted") return INVALID;
						const result = await this._def.schema._parseAsync({
							data: processed,
							path: ctx.path,
							parent: ctx
						});
						if (result.status === "aborted") return INVALID;
						if (result.status === "dirty") return DIRTY(result.value);
						if (status.value === "dirty") return DIRTY(result.value);
						return result;
					});
					else {
						if (status.value === "aborted") return INVALID;
						const result = this._def.schema._parseSync({
							data: processed,
							path: ctx.path,
							parent: ctx
						});
						if (result.status === "aborted") return INVALID;
						if (result.status === "dirty") return DIRTY(result.value);
						if (status.value === "dirty") return DIRTY(result.value);
						return result;
					}
				}
				if (effect.type === "refinement") {
					const executeRefinement = (acc) => {
						const result = effect.refinement(acc, checkCtx);
						if (ctx.common.async) return Promise.resolve(result);
						if (result instanceof Promise) throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
						return acc;
					};
					if (ctx.common.async === false) {
						const inner = this._def.schema._parseSync({
							data: ctx.data,
							path: ctx.path,
							parent: ctx
						});
						if (inner.status === "aborted") return INVALID;
						if (inner.status === "dirty") status.dirty();
						executeRefinement(inner.value);
						return {
							status: status.value,
							value: inner.value
						};
					} else return this._def.schema._parseAsync({
						data: ctx.data,
						path: ctx.path,
						parent: ctx
					}).then((inner) => {
						if (inner.status === "aborted") return INVALID;
						if (inner.status === "dirty") status.dirty();
						return executeRefinement(inner.value).then(() => {
							return {
								status: status.value,
								value: inner.value
							};
						});
					});
				}
				if (effect.type === "transform") {
					if (ctx.common.async === false) {
						const base = this._def.schema._parseSync({
							data: ctx.data,
							path: ctx.path,
							parent: ctx
						});
						if (!isValid(base)) return INVALID;
						const result = effect.transform(base.value, checkCtx);
						if (result instanceof Promise) throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
						return {
							status: status.value,
							value: result
						};
					} else return this._def.schema._parseAsync({
						data: ctx.data,
						path: ctx.path,
						parent: ctx
					}).then((base) => {
						if (!isValid(base)) return INVALID;
						return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
							status: status.value,
							value: result
						}));
					});
				}
				util.assertNever(effect);
			}
		};
		ZodEffects.create = (schema, effect, params) => {
			return new ZodEffects({
				schema,
				typeName: ZodFirstPartyTypeKind.ZodEffects,
				effect,
				...processCreateParams(params)
			});
		};
		ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
			return new ZodEffects({
				schema,
				effect: {
					type: "preprocess",
					transform: preprocess
				},
				typeName: ZodFirstPartyTypeKind.ZodEffects,
				...processCreateParams(params)
			});
		};
		var ZodOptional = class extends ZodType {
			_parse(input) {
				if (this._getType(input) === ZodParsedType.undefined) return OK(void 0);
				return this._def.innerType._parse(input);
			}
			unwrap() {
				return this._def.innerType;
			}
		};
		ZodOptional.create = (type, params) => {
			return new ZodOptional({
				innerType: type,
				typeName: ZodFirstPartyTypeKind.ZodOptional,
				...processCreateParams(params)
			});
		};
		var ZodNullable = class extends ZodType {
			_parse(input) {
				if (this._getType(input) === ZodParsedType.null) return OK(null);
				return this._def.innerType._parse(input);
			}
			unwrap() {
				return this._def.innerType;
			}
		};
		ZodNullable.create = (type, params) => {
			return new ZodNullable({
				innerType: type,
				typeName: ZodFirstPartyTypeKind.ZodNullable,
				...processCreateParams(params)
			});
		};
		var ZodDefault = class extends ZodType {
			_parse(input) {
				const { ctx } = this._processInputParams(input);
				let data = ctx.data;
				if (ctx.parsedType === ZodParsedType.undefined) data = this._def.defaultValue();
				return this._def.innerType._parse({
					data,
					path: ctx.path,
					parent: ctx
				});
			}
			removeDefault() {
				return this._def.innerType;
			}
		};
		ZodDefault.create = (type, params) => {
			return new ZodDefault({
				innerType: type,
				typeName: ZodFirstPartyTypeKind.ZodDefault,
				defaultValue: typeof params.default === "function" ? params.default : () => params.default,
				...processCreateParams(params)
			});
		};
		var ZodCatch = class extends ZodType {
			_parse(input) {
				const { ctx } = this._processInputParams(input);
				const newCtx = {
					...ctx,
					common: {
						...ctx.common,
						issues: []
					}
				};
				const result = this._def.innerType._parse({
					data: newCtx.data,
					path: newCtx.path,
					parent: { ...newCtx }
				});
				if (isAsync(result)) return result.then((result) => {
					return {
						status: "valid",
						value: result.status === "valid" ? result.value : this._def.catchValue({
							get error() {
								return new ZodError(newCtx.common.issues);
							},
							input: newCtx.data
						})
					};
				});
				else return {
					status: "valid",
					value: result.status === "valid" ? result.value : this._def.catchValue({
						get error() {
							return new ZodError(newCtx.common.issues);
						},
						input: newCtx.data
					})
				};
			}
			removeCatch() {
				return this._def.innerType;
			}
		};
		ZodCatch.create = (type, params) => {
			return new ZodCatch({
				innerType: type,
				typeName: ZodFirstPartyTypeKind.ZodCatch,
				catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
				...processCreateParams(params)
			});
		};
		var ZodNaN = class extends ZodType {
			_parse(input) {
				if (this._getType(input) !== ZodParsedType.nan) {
					const ctx = this._getOrReturnCtx(input);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: ZodParsedType.nan,
						received: ctx.parsedType
					});
					return INVALID;
				}
				return {
					status: "valid",
					value: input.data
				};
			}
		};
		ZodNaN.create = (params) => {
			return new ZodNaN({
				typeName: ZodFirstPartyTypeKind.ZodNaN,
				...processCreateParams(params)
			});
		};
		var ZodBranded = class extends ZodType {
			_parse(input) {
				const { ctx } = this._processInputParams(input);
				const data = ctx.data;
				return this._def.type._parse({
					data,
					path: ctx.path,
					parent: ctx
				});
			}
			unwrap() {
				return this._def.type;
			}
		};
		var ZodPipeline = class ZodPipeline extends ZodType {
			_parse(input) {
				const { status, ctx } = this._processInputParams(input);
				if (ctx.common.async) {
					const handleAsync = async () => {
						const inResult = await this._def.in._parseAsync({
							data: ctx.data,
							path: ctx.path,
							parent: ctx
						});
						if (inResult.status === "aborted") return INVALID;
						if (inResult.status === "dirty") {
							status.dirty();
							return DIRTY(inResult.value);
						} else return this._def.out._parseAsync({
							data: inResult.value,
							path: ctx.path,
							parent: ctx
						});
					};
					return handleAsync();
				} else {
					const inResult = this._def.in._parseSync({
						data: ctx.data,
						path: ctx.path,
						parent: ctx
					});
					if (inResult.status === "aborted") return INVALID;
					if (inResult.status === "dirty") {
						status.dirty();
						return {
							status: "dirty",
							value: inResult.value
						};
					} else return this._def.out._parseSync({
						data: inResult.value,
						path: ctx.path,
						parent: ctx
					});
				}
			}
			static create(a, b) {
				return new ZodPipeline({
					in: a,
					out: b,
					typeName: ZodFirstPartyTypeKind.ZodPipeline
				});
			}
		};
		var ZodReadonly = class extends ZodType {
			_parse(input) {
				const result = this._def.innerType._parse(input);
				const freeze = (data) => {
					if (isValid(data)) data.value = Object.freeze(data.value);
					return data;
				};
				return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
			}
			unwrap() {
				return this._def.innerType;
			}
		};
		ZodReadonly.create = (type, params) => {
			return new ZodReadonly({
				innerType: type,
				typeName: ZodFirstPartyTypeKind.ZodReadonly,
				...processCreateParams(params)
			});
		};
		ZodObject.lazycreate;
		var ZodFirstPartyTypeKind;
		(function(ZodFirstPartyTypeKind) {
			ZodFirstPartyTypeKind["ZodString"] = "ZodString";
			ZodFirstPartyTypeKind["ZodNumber"] = "ZodNumber";
			ZodFirstPartyTypeKind["ZodNaN"] = "ZodNaN";
			ZodFirstPartyTypeKind["ZodBigInt"] = "ZodBigInt";
			ZodFirstPartyTypeKind["ZodBoolean"] = "ZodBoolean";
			ZodFirstPartyTypeKind["ZodDate"] = "ZodDate";
			ZodFirstPartyTypeKind["ZodSymbol"] = "ZodSymbol";
			ZodFirstPartyTypeKind["ZodUndefined"] = "ZodUndefined";
			ZodFirstPartyTypeKind["ZodNull"] = "ZodNull";
			ZodFirstPartyTypeKind["ZodAny"] = "ZodAny";
			ZodFirstPartyTypeKind["ZodUnknown"] = "ZodUnknown";
			ZodFirstPartyTypeKind["ZodNever"] = "ZodNever";
			ZodFirstPartyTypeKind["ZodVoid"] = "ZodVoid";
			ZodFirstPartyTypeKind["ZodArray"] = "ZodArray";
			ZodFirstPartyTypeKind["ZodObject"] = "ZodObject";
			ZodFirstPartyTypeKind["ZodUnion"] = "ZodUnion";
			ZodFirstPartyTypeKind["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
			ZodFirstPartyTypeKind["ZodIntersection"] = "ZodIntersection";
			ZodFirstPartyTypeKind["ZodTuple"] = "ZodTuple";
			ZodFirstPartyTypeKind["ZodRecord"] = "ZodRecord";
			ZodFirstPartyTypeKind["ZodMap"] = "ZodMap";
			ZodFirstPartyTypeKind["ZodSet"] = "ZodSet";
			ZodFirstPartyTypeKind["ZodFunction"] = "ZodFunction";
			ZodFirstPartyTypeKind["ZodLazy"] = "ZodLazy";
			ZodFirstPartyTypeKind["ZodLiteral"] = "ZodLiteral";
			ZodFirstPartyTypeKind["ZodEnum"] = "ZodEnum";
			ZodFirstPartyTypeKind["ZodEffects"] = "ZodEffects";
			ZodFirstPartyTypeKind["ZodNativeEnum"] = "ZodNativeEnum";
			ZodFirstPartyTypeKind["ZodOptional"] = "ZodOptional";
			ZodFirstPartyTypeKind["ZodNullable"] = "ZodNullable";
			ZodFirstPartyTypeKind["ZodDefault"] = "ZodDefault";
			ZodFirstPartyTypeKind["ZodCatch"] = "ZodCatch";
			ZodFirstPartyTypeKind["ZodPromise"] = "ZodPromise";
			ZodFirstPartyTypeKind["ZodBranded"] = "ZodBranded";
			ZodFirstPartyTypeKind["ZodPipeline"] = "ZodPipeline";
			ZodFirstPartyTypeKind["ZodReadonly"] = "ZodReadonly";
		})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
		const stringType = ZodString.create;
		const numberType = ZodNumber.create;
		ZodNaN.create;
		ZodBigInt.create;
		const booleanType = ZodBoolean.create;
		ZodDate.create;
		ZodSymbol.create;
		ZodUndefined.create;
		const nullType = ZodNull.create;
		ZodAny.create;
		const unknownType = ZodUnknown.create;
		ZodNever.create;
		ZodVoid.create;
		const arrayType = ZodArray.create;
		const objectType = ZodObject.create;
		ZodObject.strictCreate;
		const unionType = ZodUnion.create;
		ZodDiscriminatedUnion.create;
		ZodIntersection.create;
		ZodTuple.create;
		const recordType = ZodRecord.create;
		ZodMap.create;
		ZodSet.create;
		ZodFunction.create;
		const lazyType = ZodLazy.create;
		const literalType = ZodLiteral.create;
		ZodEnum.create;
		ZodNativeEnum.create;
		ZodPromise.create;
		ZodEffects.create;
		ZodOptional.create;
		ZodNullable.create;
		ZodEffects.createWithPreprocess;
		ZodPipeline.create;
		//#endregion
		//#region src/bridge-contract.ts
		/**
		* 卡片桥的契约：frame 里的 `window.dsh` 与宿主之间的消息格式、数值上限与 zod 校验。
		* node 半边（状态路由、系统提示段）和浏览器半边（卡片）共用这一份，frame 内的桥脚本
		* 只做同样数值的轻量预检，最终以这里的校验为准。
		*
		* 数值沿用 ZCode Gen UI 公开契约：单张卡片状态序列化后 ≤ 16 KiB；回流模型的
		* modelContent 最多 100 条、合计 ≤ 64 KiB；追问正文 ≤ 64 KiB、标题 ≤ 250 字。
		*
		* @module @lbryany/dsh-widget/bridge-contract
		*/
		/** frame→卡片的桥调用。 */
		const BRIDGE_MESSAGE_TYPE = "dsh-widget:bridge";
		/** 卡片→frame 的调用结果。 */
		const BRIDGE_RESULT_TYPE = "dsh-widget:bridge-result";
		/** frame 内派发的状态 / 主题事件名。 */
		const GLOBALS_EVENT = "dsh:set_globals";
		/** 单张卡片状态（modelContent + privateContent）序列化后的上限。 */
		const STATE_MAX_BYTES = 16384;
		/** 追问正文上限（UTF-8 字节）。 */
		const PROMPT_MAX_BYTES = 65536;
		/** 手势门：距 frame 内最近一次可信的用户输入超过这么久就拒绝。 */
		const GESTURE_WINDOW_MS = 1500;
		/** 卡片追问在对话里的文本标记。 */
		const FOLLOW_UP_MARK = "[卡片追问] ";
		/** 状态读写路由（宿主已鉴权的 /api 通道）。 */
		const STATE_PATH = "/api/dsh-widget/state";
		/** 卡片片段路径（状态的键）长度上限。 */
		const CARD_PATH_MAX_CHARS = 4096;
		const jsonValueSchema = lazyType(() => unionType([
			nullType(),
			booleanType(),
			numberType().finite(),
			stringType(),
			arrayType(jsonValueSchema),
			recordType(stringType(), jsonValueSchema)
		]));
		/**
		* UTF-8 字节数。
		* @param text - 文本。
		* @returns 字节数。
		*/
		function utf8Bytes(text) {
			return new TextEncoder().encode(text).length;
		}
		/** setWidgetState 的参数：只许两个键，缺省视为 null，序列化后 ≤ 16 KiB。 */
		const widgetStateSchema = objectType({
			modelContent: jsonValueSchema.optional(),
			privateContent: jsonValueSchema.optional()
		}).strict().transform((state) => ({
			modelContent: state.modelContent ?? null,
			privateContent: state.privateContent ?? null
		})).superRefine((state, issue) => {
			if (utf8Bytes(JSON.stringify(state)) > 16384) issue.addIssue({
				code: ZodIssueCode.custom,
				message: `widget state exceeds ${STATE_MAX_BYTES} bytes`
			});
		});
		/** sendFollowUpMessage 的参数。 */
		const followUpSchema = objectType({
			prompt: stringType().min(1).refine((text) => text.trim().length > 0, "prompt is blank").refine((text) => utf8Bytes(text) <= PROMPT_MAX_BYTES, `prompt exceeds ${PROMPT_MAX_BYTES} bytes`),
			title: stringType().max(250).optional()
		}).strict();
		/**
		* 是否 http(s) 绝对地址。
		* @param href - 地址。
		* @returns 是则 true。
		*/
		function isHttpUrl(href) {
			try {
				const url = new URL(href);
				return url.protocol === "http:" || url.protocol === "https:";
			} catch {
				return false;
			}
		}
		/** openExternal 的参数：只认 http(s)。 */
		const openExternalSchema = objectType({ href: stringType().max(8192).refine(isHttpUrl, "only http(s) links can be opened") }).strict();
		/** frame→卡片的一次调用。 */
		const bridgeRequestSchema = objectType({
			type: literalType(BRIDGE_MESSAGE_TYPE),
			token: stringType(),
			id: numberType().int().nonnegative(),
			method: stringType().max(64),
			params: unknownType()
		});
		/** 卡片片段路径：上游 visualize 报告给模型的那个路径（`~/` 开头或绝对路径）。 */
		const cardPathSchema = stringType().min(1).max(CARD_PATH_MAX_CHARS).refine((path) => !/[\u0000-\u001f]/u.test(path), "card path has control characters");
		objectType({
			session: stringType().min(1).max(256),
			path: cardPathSchema,
			title: stringType().max(250).optional(),
			state: widgetStateSchema
		}).strict();
		/**
		* 把 zod 错误压成一行。
		* @param error - zod 错误。
		* @returns 一行说明。
		*/
		function describeIssues(error) {
			return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
		}
		//#endregion
		//#region src/frame-bridge.ts
		/**
		* frame 里的宿主桥 `window.dsh`：由 shell.ts 在片段脚本之前内联注入（frame 的 CSP 已允许
		* inline script），纯字符串组装、不碰 DOM，node 侧单测可直接跑。
		*
		* - `widgetState`：当前快照或 null，文档组装时内联（同步可读，渲染时就能用）。
		* - `setWidgetState(state)`：预检（只许两个键、JSON-only、≤ 16 KiB）后发给卡片，卡片写宿主、
		*   落盘后回 ack 才 resolve；连续调用按序排队；成功后更新快照并派发 `dsh:set_globals`。
		* - `sendFollowUpMessage({ prompt, title? })` / `openExternal({ href })`：手势门——距 frame
		*   内最近一次可信的用户输入超过 1.5 秒直接以 `no-user-gesture` 失败。
		* - 文档上挂捕获阶段 click：http(s) 锚点改走 openExternal（沙箱没有 allow-popups，本来也开不了）。
		* - 加载完成后派发一次 `dsh:set_globals`（`detail.globals = { widgetState, theme }`）。
		*
		* frame 里跑的是模型写的代码，它也能绕开这些函数直接 postMessage；所以这里的检查只是
		* 尽早给出明确的错误，真正的关口在卡片侧（来源校验、zod、宿主侧用户激活检查、确认框）。
		*
		* @module @lbryany/dsh-widget/frame-bridge
		*/
		/**
		* 把值序列化成可安全内联进 `<script>` 的 JS 字面量。
		* @param value - JSON 值。
		* @returns 字面量文本。
		*/
		function scriptLiteral(value) {
			return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
		}
		/**
		* frame 内桥脚本正文。
		* @param options - 令牌、初始状态、主题、连接方式。
		* @returns 内联脚本正文。
		*/
		function frameBridgeScript(options) {
			return `
(function () {
  var TOKEN = ${scriptLiteral(options.token)};
  var LIVE = ${options.mode === "live" ? "true" : "false"};
  var REQUEST = ${scriptLiteral(BRIDGE_MESSAGE_TYPE)};
  var RESULT = ${scriptLiteral(BRIDGE_RESULT_TYPE)};
  var EVENT = ${scriptLiteral(GLOBALS_EVENT)};
  var STATE_MAX = ${STATE_MAX_BYTES};
  var PROMPT_MAX = ${PROMPT_MAX_BYTES};
  var TITLE_MAX = 250;
  var GESTURE_MS = ${GESTURE_WINDOW_MS};
  var state = ${scriptLiteral(options.state)};
  var theme = ${scriptLiteral(options.theme)};
  var lastGesture = -Infinity;
  var seq = 0;
  var pending = {};
  var queue = Promise.resolve();
  var now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
  var mark = function (event) { if (event.isTrusted) lastGesture = now(); };
  ['pointerup', 'keyup', 'keydown', 'click'].forEach(function (name) { addEventListener(name, mark, true); });
  function fail(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  }
  function bytes(text) { return new TextEncoder().encode(text).length; }
  function copy(value) { return value === null ? null : JSON.parse(JSON.stringify(value)); }
  function isJson(value, depth) {
    if (depth > 64) return false;
    if (value === null) return true;
    var kind = typeof value;
    if (kind === 'string' || kind === 'boolean') return true;
    if (kind === 'number') return isFinite(value);
    if (kind !== 'object') return false;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) if (!(i in value) || !isJson(value[i], depth + 1)) return false;
      return true;
    }
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key) && !isJson(value[key], depth + 1)) return false;
    }
    return true;
  }
  function gestureOk() { return now() - lastGesture <= GESTURE_MS; }
  function emit() {
    dispatchEvent(new CustomEvent(EVENT, { detail: { globals: { widgetState: copy(state), theme: theme } } }));
  }
  addEventListener('message', function (event) {
    if (event.source !== parent) return;
    var data = event.data;
    if (!data || data.type !== RESULT || data.token !== TOKEN || typeof data.id !== 'number') return;
    var waiter = pending[data.id];
    if (!waiter) return;
    delete pending[data.id];
    if (data.ok) waiter.resolve(data.value);
    else waiter.reject(fail(String(data.error || 'failed'), typeof data.message === 'string' ? data.message : undefined));
  });
  function call(method, params) {
    if (!LIVE || parent === window) return Promise.reject(fail('unavailable', 'this card is not connected to the host'));
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      try {
        parent.postMessage({ type: REQUEST, token: TOKEN, id: id, method: method, params: params }, '*');
      } catch (error) {
        delete pending[id];
        reject(fail('invalid-params', String(error && error.message || error)));
      }
    });
  }
  function setWidgetState(next) {
    if (typeof next !== 'object' || next === null || Array.isArray(next)) return Promise.reject(fail('invalid-params', 'state must be an object'));
    for (var key in next) {
      if (Object.prototype.hasOwnProperty.call(next, key) && key !== 'modelContent' && key !== 'privateContent') {
        return Promise.reject(fail('invalid-params', 'unknown state key: ' + key));
      }
    }
    var normalized = {
      modelContent: next.modelContent === undefined ? null : next.modelContent,
      privateContent: next.privateContent === undefined ? null : next.privateContent,
    };
    if (!isJson(normalized.modelContent, 0) || !isJson(normalized.privateContent, 0)) {
      return Promise.reject(fail('invalid-params', 'state must be JSON (no functions, undefined, NaN or Infinity)'));
    }
    var text = JSON.stringify(normalized);
    if (bytes(text) > STATE_MAX) return Promise.reject(fail('invalid-params', 'state exceeds ' + STATE_MAX + ' bytes'));
    var snapshot = JSON.parse(text);
    var run = function () {
      return call('state.set', snapshot).then(function () { state = snapshot; emit(); });
    };
    var result = queue.then(run, run);
    queue = result.catch(function () {});
    return result;
  }
  function sendFollowUpMessage(options) {
    if (!gestureOk()) return Promise.reject(fail('no-user-gesture', 'sendFollowUpMessage must follow a click or key press in the card'));
    var prompt = options && options.prompt;
    var title = options && options.title;
    if (typeof prompt !== 'string' || prompt.trim() === '' || bytes(prompt) > PROMPT_MAX) {
      return Promise.reject(fail('invalid-params', 'prompt must be non-empty text of at most ' + PROMPT_MAX + ' bytes'));
    }
    if (title !== undefined && (typeof title !== 'string' || title.length > TITLE_MAX)) {
      return Promise.reject(fail('invalid-params', 'title must be text of at most ' + TITLE_MAX + ' characters'));
    }
    return call('followUp', title === undefined ? { prompt: prompt } : { prompt: prompt, title: title }).then(function () {});
  }
  function httpHref(href) {
    try {
      var url = new URL(href);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (error) {
      return null;
    }
  }
  function openExternal(options) {
    if (!gestureOk()) return Promise.reject(fail('no-user-gesture', 'openExternal must follow a click or key press in the card'));
    var href = httpHref(options && options.href);
    if (href === null) return Promise.reject(fail('invalid-params', 'only http(s) links can be opened'));
    return call('openExternal', { href: href }).then(function () {});
  }
  var api = {
    setWidgetState: setWidgetState,
    sendFollowUpMessage: sendFollowUpMessage,
    openExternal: openExternal,
  };
  Object.defineProperty(api, 'widgetState', { enumerable: true, get: function () { return copy(state); } });
  Object.defineProperty(api, 'theme', { enumerable: true, get: function () { return theme; } });
  Object.defineProperty(window, 'dsh', { value: Object.freeze(api), enumerable: true });
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented) return;
    var target = event.target;
    var anchor = target && target.closest ? target.closest('a[href]') : null;
    if (!anchor) return;
    var href = httpHref(anchor.href);
    if (href === null) return;
    event.preventDefault();
    openExternal({ href: href }).catch(function () {});
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', emit);
  else setTimeout(emit, 0);
})();
`;
		}
		const RESOURCE_SOURCES = [
			"blob:",
			"data:",
			...[
				"https://cdnjs.cloudflare.com",
				"https://cdn.jsdelivr.net",
				"https://esm.sh",
				"https://fonts.bunny.net",
				"https://fonts.googleapis.com",
				"https://fonts.gstatic.com",
				"https://unpkg.com"
			]
		].join(" ");
		/** The frame document's Content-Security-Policy. */
		const FRAME_CSP = [
			"default-src 'none'",
			`script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${RESOURCE_SOURCES}`,
			`style-src 'unsafe-inline' ${RESOURCE_SOURCES}`,
			`img-src ${RESOURCE_SOURCES}`,
			`font-src ${RESOURCE_SOURCES}`,
			`media-src ${RESOURCE_SOURCES}`,
			"worker-src blob:",
			"connect-src blob: data:",
			"frame-src 'none'",
			"object-src 'none'",
			"base-uri 'none'",
			"form-action 'none'"
		].join("; ");
		/** Wire type of the frame→card height report message. */
		const HEIGHT_MESSAGE_TYPE = "dsh-widget:height";
		/** Wire type of the card→frame streaming fragment update message. */
		const STREAM_MESSAGE_TYPE = "dsh-widget:stream";
		/**
		* Assemble the complete srcdoc document for one visualization frame.
		* @param options - fragment, title, bridged palette, report token, surface variant, and card style.
		* @returns the HTML document string for the iframe's `srcDoc`.
		*/
		function buildFrameDoc(options) {
			const style = STYLES[options.style ?? "whale"] ?? STYLES["whale"];
			const rootVars = Object.entries({
				...options.themeVars,
				...style.vars
			}).map(([name, value]) => [name, sanitizeCssValue(value)]).filter(([, value]) => value.length > 0).map(([name, value]) => `--dsh-viz-${name}: ${value};`).join(" ");
			return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<title>${escapeHtml$1(options.title)}</title>
${style.fontHref === void 0 ? "" : `<link rel="stylesheet" href="${escapeHtml$1(style.fontHref)}">\n`}<style>${FRAME_CSS}${options.variant === "page" ? PAGE_CSS : ""}
:root { ${rootVars} color-scheme: ${options.colorScheme}; }
${options.variant === "page" ? "" : "body { padding: 4px 2px; }"}${style.extraCss === void 0 ? "" : `\n${style.extraCss}`}</style>
<script>${vizHelperScript(style.id, style.chart)}<\/script>
<script>${frameBridgeScript({
				token: options.reportToken,
				state: options.bridge?.state ?? null,
				theme: options.colorScheme,
				mode: options.bridge?.mode ?? "detached"
			})}<\/script>
</head>
<body>
${options.fragment}
<script>${heightReporter(options.reportToken)}<\/script>
</body>
</html>
`;
		}
		/**
		* The frame-side height reporter: posts the document's scroll height to the
		* parent on load and on every resize, so the card can size the iframe to its
		* content (a sandboxed frame's document is unreachable from the parent).
		* @param reportToken - correlation token echoed in each message.
		* @returns the inline script body.
		*/
		function heightReporter(reportToken) {
			const token = JSON.stringify(reportToken);
			return `
(function () {
  var post = function () {
    parent.postMessage({
      type: ${JSON.stringify(HEIGHT_MESSAGE_TYPE)},
      token: ${token},
      height: document.documentElement.scrollHeight,
    }, '*');
  };
  new ResizeObserver(post).observe(document.documentElement);
  addEventListener('load', post);
  post();
})();
`;
		}
		/**
		* Assemble the persistent streaming shell: an initially empty document that
		* receives fragment prefixes over `postMessage` and syncs them into its DOM
		* incrementally — unchanged elements persist (no reload churn) and newly
		* arrived elements float in via an enter animation, the Claude-style
		* component-by-component reveal. Scripts inside synced markup stay inert by
		* the `innerHTML` parsing rule, which is exactly right for a half-generated
		* fragment; the settled card runs the finished scripts.
		* @param options - bridged palette, scheme, and correlation token (fragment is ignored).
		* @returns the HTML document string for the preview iframe's `srcDoc`.
		*/
		function buildStreamShellDoc(options) {
			return buildFrameDoc({
				...options,
				title: "Streaming preview",
				fragment: `<div id="dsh-viz-stream-root"></div>
<style>
.dsh-viz-enter { animation: dsh-viz-enter 0.4s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
@keyframes dsh-viz-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>
<script>${streamSync(options.reportToken)}<\/script>`
			});
		}
		/**
		* The frame-side incremental DOM sync: parses each posted fragment prefix
		* into a detached tree and reconciles it against the live root by child
		* index — same tag syncs attributes and recurses, a mismatch replaces, a new
		* node appends with the enter class, extras drop. Index-based reconciliation
		* is exact for streamed markup, which only ever grows or refines its tail.
		* @param reportToken - correlation token accepted on incoming messages.
		* @returns the inline script body.
		*/
		function streamSync(reportToken) {
			return `
(function () {
  var root = document.getElementById('dsh-viz-stream-root');
  var token = ${JSON.stringify(reportToken)};
  function syncAttrs(cur, next) {
    var i, attrs = cur.attributes;
    for (i = attrs.length - 1; i >= 0; i--) {
      if (!next.hasAttribute(attrs[i].name)) cur.removeAttribute(attrs[i].name);
    }
    attrs = next.attributes;
    for (i = 0; i < attrs.length; i++) {
      if (cur.getAttribute(attrs[i].name) !== attrs[i].value) cur.setAttribute(attrs[i].name, attrs[i].value);
    }
  }
  function executable(node) {
    // Scripts parsed via innerHTML are permanently inert; an executable clone
    // runs on insertion. Streamed markup only ever appends, so each complete
    // script block arrives at its index exactly once and runs exactly once.
    var script = document.createElement('script');
    for (var i = 0; i < node.attributes.length; i++) {
      script.setAttribute(node.attributes[i].name, node.attributes[i].value);
    }
    script.textContent = node.textContent;
    return script;
  }
  function sync(cur, next) {
    var want = next.childNodes, have = cur.childNodes, i;
    for (i = 0; i < want.length; i++) {
      var target = want[i], live = have[i];
      if (live === undefined) {
        var added = target.nodeName === 'SCRIPT' ? executable(target) : target.cloneNode(true);
        if (added.nodeType === 1 && added.nodeName !== 'SCRIPT') added.classList.add('dsh-viz-enter');
        cur.appendChild(added);
        continue;
      }
      if (live.nodeType !== target.nodeType || live.nodeName !== target.nodeName) {
        cur.replaceChild(target.cloneNode(true), live);
        continue;
      }
      if (live.nodeType === 3 || live.nodeType === 8) {
        if (live.nodeValue !== target.nodeValue) live.nodeValue = target.nodeValue;
        continue;
      }
      if (live.nodeType === 1) {
        syncAttrs(live, target);
        sync(live, target);
      }
    }
    while (cur.childNodes.length > want.length) cur.removeChild(cur.lastChild);
  }
  addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== ${JSON.stringify(STREAM_MESSAGE_TYPE)} || data.token !== token) return;
    if (typeof data.fragment !== 'string') return;
    var next = document.createElement('div');
    next.innerHTML = data.fragment;
    sync(root, next);
  });
})();
`;
		}
		/**
		* Keep one bridged palette value inert inside a style block: resolved
		* computed-style colors never contain declaration or block delimiters, so any
		* occurrence marks a malformed value, dropped rather than repaired.
		* @param value - the raw computed-style value.
		* @returns the trimmed value, or empty when it must be dropped.
		*/
		function sanitizeCssValue(value) {
			const trimmed = value.trim();
			return /[;{}<>]/u.test(trimmed) ? "" : trimmed;
		}
		/**
		* Minimal HTML text escape for the frame `<title>`.
		* @param text - raw text.
		* @returns the escaped text.
		*/
		function escapeHtml$1(text) {
			return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		}
		//#endregion
		//#region src/window-doc.ts
		/**
		* The page a card opens as when the reader takes it into its own browser tab.
		* DOM-free so the node-side specs exercise it directly.
		*
		* Security model: the card hands this page to the browser as a Blob URL, and a
		* Blob URL created by the dsh web page has the dsh web origin — anything that
		* ran as this page's own script could read the host's token and storage and
		* call its APIs. So the page carries no script and no model text of its own:
		* it is one full-viewport `<iframe sandbox="allow-scripts">` (the same
		* sandbox, referrer policy, and frame document as the in-chat card), with the
		* frame document passed only inside the escaped `srcdoc` attribute. Inside
		* the frame the fragment has an opaque origin, exactly as in the chat.
		*
		* @module @lbryany/dsh-widget/window-doc
		*/
		/** Sandbox flags shared by the in-chat card and the windowed page. */
		const FRAME_SANDBOX = "allow-scripts";
		/**
		* Assemble the windowed page around one frame document.
		* @param options - the frame document, title, and host theme at open time.
		* @returns the HTML for the Blob the new tab opens.
		*/
		function buildWindowDoc(options) {
			const surface = sanitizeCssValue(options.background);
			const background = surface.length > 0 ? surface : options.colorScheme === "dark" ? "#1b1b1f" : "#ffffff";
			const inset = options.variant === "page" ? "0" : "16px 24px";
			return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(options.title)}</title>
<style>
:root { color-scheme: ${options.colorScheme}; background: ${background}; }
html, body { margin: 0; height: 100%; }
iframe { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 0; padding: ${inset}; background: transparent; color-scheme: ${options.colorScheme}; }
</style>
</head>
<body><iframe sandbox="${FRAME_SANDBOX}" referrerpolicy="no-referrer" title="${escapeHtml(options.title)}" srcdoc="${escapeHtml(options.frameDoc)}"></iframe></body>
</html>
`;
		}
		/**
		* HTML escape safe for text and double-quoted attribute values. `&` goes
		* first so the later entities are not double-escaped; `"` is what keeps the
		* frame document inside its `srcdoc` attribute.
		* @param text - raw text.
		* @returns the escaped text.
		*/
		function escapeHtml(text) {
			return text.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		}
		//#endregion
		//#region src/client/theme.ts
		/**
		* Host-theme resolution shared by the settled card and the streaming preview:
		* reads the DSH `--dsw-alias-*` design tokens (whale-blue brand accent
		* included) off `document.body` and derives the host color scheme. The body is
		* the read point because DSH mounts the token definitions there (dark override
		* under `body[data-ds-dark-theme]`), and custom properties only cascade
		* DOWNWARD — a `:root`-mounted theme still reaches the body by inheritance,
		* the reverse read never works. Missing tokens resolve to empty strings the
		* shell drops, so the frame stylesheet's `light-dark()` fallbacks apply
		* outside DSH.
		*/
		/** Host design token → frame variable bridge (values resolved per render). */
		const TOKEN_BRIDGE = [
			["foreground", "--dsw-alias-label-primary"],
			["card", "--dsw-alias-bg-layer-1"],
			["page", "--dsw-alias-bg-base"],
			["muted-foreground", "--dsw-alias-label-caption"],
			["border", "--dsw-alias-border-l2"],
			["primary", "--dsw-alias-brand-primary-new-colorprimary-new-color"],
			["primary-foreground", "--dsw-alias-label-primary-inverted"]
		];
		/**
		* Resolve the bridged palette and the host color scheme from computed style.
		* @returns the palette map and scheme for {@link buildFrameDoc}.
		*/
		function resolveTheme() {
			const computed = getComputedStyle(document.body);
			const themeVars = {};
			for (const [frameName, hostToken] of TOKEN_BRIDGE) themeVars[frameName] = computed.getPropertyValue(hostToken);
			const scheme = computed.colorScheme;
			return {
				themeVars,
				colorScheme: scheme.includes("dark") && !scheme.includes("light") ? "dark" : scheme.includes("light") && !scheme.includes("dark") ? "light" : document.body.hasAttribute("data-ds-dark-theme") ? "dark" : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
			};
		}
		//#endregion
		//#region src/client/style.ts
		/**
		* The style a card that has no persisted meta yet renders in: the dock
		* preview and a running call's live frame. The node half writes the
		* configured style into every page it serves (index.ts), which is the answer
		* from dsh 0.1.1 on. Where that value is missing — a host page that does not
		* run the plugin's node half, or a static build — the card borrows the style
		* of the most recently settled card created on this page, which the next card
		* will almost always share. The settled card re-renders in its own style
		* either way.
		*/
		let lastCreated = DEFAULT_STYLE;
		/**
		* Note the style of a settled card. Only a create speaks for the setting: an
		* update keeps the style its card was created with, however old.
		* @param style - that card's style.
		* @param argsRaw - the call's raw arguments, for its action.
		*/
		function noteSettledStyle(style, argsRaw) {
			if (argsRaw !== void 0 && /"action"\s*:\s*"update"/u.test(argsRaw)) return;
			lastCreated = style;
		}
		/**
		* The style a card whose meta has not arrived yet renders in.
		* @returns the configured style from the page, else the last created card's.
		*/
		function liveStyle() {
			return configuredStyle() ?? lastCreated;
		}
		/** The configured style the node half put on this page, when it is a known id. */
		function configuredStyle() {
			const style = globalThis[PAGE_CONFIG_GLOBAL]?.style;
			return typeof style === "string" && STYLE_IDS.includes(style) ? style : void 0;
		}
		//#endregion
		//#region src/client/bridge-host.ts
		/**
		* 卡片侧的桥：接 frame 里 `window.dsh` 发来的调用，校验后交给宿主能力，再把结果回给
		* 那个 frame。四层关口里的三层在这里：只认自己 iframe 的 `contentWindow` 发来的消息、
		* 消息体与参数过 zod、追问与外链要求宿主页面此刻有用户激活（frame 内的点击会激活祖先
		* 页面）；第四层是确认框（VisualizeCard 里）。
		*
		* 另有状态路由的浏览器客户端，以及按会话组装宿主能力（读写状态、往会话发消息）的工厂。
		*
		* @module @lbryany/dsh-widget/client/bridge-host
		*/
		/** 带原因码的桥错误。 */
		var BridgeError = class extends Error {
			code;
			/**
			* @param code - 原因码。
			* @param message - 说明。
			*/
			constructor(code, message) {
				super(message ?? code);
				this.code = code;
			}
		};
		/**
		* 读宿主页面的用户激活。
		* @returns 有激活或无法判断时 true。
		*/
		function hostUserActive() {
			const activation = navigator.userActivation;
			return typeof activation?.isActive === "boolean" ? activation.isActive : true;
		}
		/**
		* 在窗口上挂一张卡片的桥。
		* @param options - 令牌、frame、方法实现。
		* @returns 解除监听。
		*/
		function attachBridgeHost(options) {
			const target = options.target ?? window;
			const userActive = options.userActive ?? hostUserActive;
			const onMessage = (event) => {
				const frame = options.frame();
				if (frame === null || frame === void 0 || event.source !== frame) return;
				const parsed = bridgeRequestSchema.safeParse(event.data);
				if (!parsed.success || parsed.data.token !== options.token) return;
				const { id, method, params } = parsed.data;
				const reply = (result) => {
					try {
						const message = {
							type: BRIDGE_RESULT_TYPE,
							token: options.token,
							id,
							...result
						};
						frame.postMessage(message, "*");
					} catch {}
				};
				dispatch(method, params, options.handlers, userActive).then((value) => reply({
					ok: true,
					value: value ?? null
				}), (error) => reply(error instanceof BridgeError ? {
					ok: false,
					error: error.code,
					message: error.message
				} : {
					ok: false,
					error: "failed",
					message: error instanceof Error ? error.message : String(error)
				}));
			};
			target.addEventListener("message", onMessage);
			return () => target.removeEventListener("message", onMessage);
		}
		/**
		* 校验参数并调用对应方法。
		* @param method - 方法名。
		* @param params - 未校验的参数。
		* @param handlers - 方法实现。
		* @param userActive - 用户激活检查。
		* @returns 方法结果。
		*/
		async function dispatch(method, params, handlers, userActive) {
			switch (method) {
				case "state.set": {
					const state = widgetStateSchema.safeParse(params);
					if (!state.success) throw new BridgeError("invalid-params", describeIssues(state.error));
					await handlers.setState(state.data);
					return null;
				}
				case "followUp": {
					const request = followUpSchema.safeParse(params);
					if (!request.success) throw new BridgeError("invalid-params", describeIssues(request.error));
					if (!userActive()) throw new BridgeError("no-user-gesture", "no recent user activation on the host page");
					await handlers.followUp(request.data);
					return null;
				}
				case "openExternal": {
					const request = openExternalSchema.safeParse(params);
					if (!request.success) throw new BridgeError("invalid-params", describeIssues(request.error));
					if (!userActive()) throw new BridgeError("no-user-gesture", "no recent user activation on the host page");
					await handlers.openExternal(request.data);
					return null;
				}
				default: throw new BridgeError("unknown-method", `unknown bridge method: ${method}`);
			}
		}
		/**
		* 状态路由客户端：按文档地址解析 `/api` 路由（同上游风格文件路由），浏览器会话 cookie 鉴权。
		* @param fetchImpl - fetch。
		* @param base - 基地址。
		* @returns 客户端。
		*/
		function stateClient(fetchImpl = (...args) => fetch(...args), base = () => document.baseURI) {
			const url = () => new URL(STATE_PATH.slice(1), base());
			return {
				async load(session, path) {
					const target = url();
					target.searchParams.set("session", session);
					target.searchParams.set("path", path);
					const response = await fetchImpl(target.href, {
						credentials: "same-origin",
						headers: { accept: "application/json" }
					});
					if (!response.ok) return null;
					const record = (await response.json().catch(() => ({}))).record;
					if (record === null || record === void 0 || typeof record !== "object") return null;
					const state = widgetStateSchema.safeParse(record.state);
					return state.success ? {
						...record,
						state: state.data
					} : null;
				},
				async save(session, path, title, state) {
					const response = await fetchImpl(url().href, {
						method: "POST",
						credentials: "same-origin",
						headers: {
							"content-type": "application/json",
							accept: "application/json"
						},
						body: JSON.stringify({
							session,
							path,
							title: title.slice(0, 250),
							state
						})
					});
					if (response.ok) return;
					const body = await response.json().catch(() => ({}));
					const message = typeof body.message === "string" ? body.message : `HTTP ${response.status}`;
					throw new BridgeError(response.status === 400 || response.status === 413 ? "invalid-params" : "failed", message);
				}
			};
		}
		/**
		* 按会话组装宿主能力。往会话发消息走 `ctx.get('sessions').scope(id).get('conversation').send(text)`：
		* conversation 服务按调用方的会话作用域寻址，根上下文直接调会抛错。
		* @param ctx - 客户端根上下文。
		* @param sessionId - 会话 id。
		* @param client - 状态路由客户端。
		* @returns 宿主能力；拿不到会话 id 时 undefined。
		*/
		function widgetHostFor(ctx, sessionId, client) {
			if (typeof sessionId !== "string" || sessionId === "") return void 0;
			return {
				sessionId,
				loadState: async (path) => await client.load(sessionId, path),
				saveState: async (path, title, state) => await client.save(sessionId, path, title, state),
				async send(text) {
					let sessions;
					try {
						sessions = ctx.get("sessions");
					} catch {
						sessions = void 0;
					}
					const scope = sessions?.scope?.(sessionId);
					let conversation;
					try {
						conversation = scope?.get?.("conversation");
					} catch {
						conversation = void 0;
					}
					if (typeof conversation?.send !== "function") throw new BridgeError("unavailable", "this session cannot take messages here");
					await conversation.send(text);
				}
			};
		}
		//#endregion
		//#region src/client/VisualizeCard.tsx
		/**
		* The `visualize` toolview: renders the persisted fragment from the call's
		* durable meta inside `<iframe sandbox="allow-scripts">` with the frame's own
		* CSP. Replay-stable by construction — everything drawn derives from the
		* logged call slice, never from the fragment file.
		*
		* Theme bridge: the card resolves the host's `--dsw-alias-*` design tokens
		* (whale-blue brand accent included) at render time and injects them into the
		* frame document as `--dsh-viz-*` variables; a mutation of the root element's
		* attributes or an OS appearance flip re-resolves them, so the frame follows
		* live theme switches. The frame body stays transparent to blend with the
		* conversation surface.
		*
		* Height: a sandboxed frame's document is unreachable from the parent, so the
		* frame posts its scroll height (tagged with this call's id) and the card
		* sizes the iframe, capped per mode with internal scrolling past the cap.
		*
		* Open in new window: the header's icon button reopens the same frame
		* document full-size in its own tab, wrapped in a script-free page whose only
		* content is the identically sandboxed iframe (see window-doc.ts).
		*
		* Page mode: a `page` card is built for a whole browser tab, so the chat shows
		* a launcher instead — title, summary, a live but inert thumbnail of the page
		* laid out at desktop width and scaled into the card, and a button that opens
		* the page through the same script-free wrapper. A secondary toggle shows the
		* page in the conversation, for browsers or hosts that will not open a tab.
		*
		* 宿主桥（dsh-widget 新增）：卡片先经状态路由读出这张卡片保存的状态，内联进 frame 文档
		* （`window.dsh.widgetState` 同步可读），再挂 iframe；frame 发来的桥调用由 bridge-host.ts
		* 校验后在这里落实——写状态、弹确认框后以用户身份追问、在新标签打开外链。新窗口与缩略图
		* 拿到的是当时的状态快照，只读。
		*/
		/** Iframe height bounds; content beyond the cap scrolls inside the frame. */
		const MIN_HEIGHT = 48;
		const HEIGHT_CAP = {
			inline: 800,
			wide: 1200,
			page: 800
		};
		const headerStyle = {
			display: "flex",
			alignItems: "baseline",
			gap: 8,
			fontSize: 12,
			opacity: .65,
			margin: "2px 0 6px",
			overflow: "hidden",
			whiteSpace: "nowrap"
		};
		/**
		* The card never widens its column: `minWidth: 0` lets the card shrink as a
		* flex or grid item (whose automatic minimum is its min-content width, here
		* the whole no-wrap header), so a long path truncates instead of stretching
		* the frame past the transcript.
		*/
		const cardStyle = {
			minWidth: 0,
			maxWidth: "100%"
		};
		/** Title keeps its width until it alone fills the row; the path yields first. */
		const titleStyle = {
			fontWeight: 500,
			flexShrink: 0,
			maxWidth: "100%",
			overflow: "hidden",
			textOverflow: "ellipsis"
		};
		const pathStyle$1 = {
			minWidth: 0,
			overflow: "hidden",
			textOverflow: "ellipsis"
		};
		/** Icon button at the header's end; it never yields width to the path. */
		const openStyle = {
			alignSelf: "center",
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			flexShrink: 0,
			marginLeft: "auto",
			width: 22,
			height: 22,
			padding: 0,
			border: 0,
			borderRadius: 4,
			background: "transparent",
			color: "inherit",
			cursor: "pointer",
			outlineOffset: -2
		};
		/**
		* Open the card full-size in its own tab. The tab is a script-free Blob page
		* holding the same sandboxed frame (see window-doc.ts), themed as the host is
		* right now. Synchronous end to end so the browser treats it as a user-opened
		* tab rather than a blocked popup. The URL is not revoked: the tab can then be
		* reloaded, and the browser frees it when the chat page unloads.
		* @param meta - the card to open.
		* @param callId - correlation token base for the frame's height reports.
		*/
		function openInWindow(meta, callId, state = null) {
			const { themeVars, colorScheme } = resolveTheme();
			const variant = variantOf(meta);
			const frameDoc = buildFrameDoc({
				fragment: meta.fragment,
				title: meta.title,
				themeVars,
				colorScheme,
				style: meta.style,
				reportToken: `window:${callId}`,
				variant,
				bridge: {
					state,
					mode: "detached"
				}
			});
			const background = (variant === "page" ? themeVars.page : themeVars.card) ?? "";
			const page = buildWindowDoc({
				frameDoc,
				title: meta.title,
				colorScheme,
				background,
				variant
			});
			const url = URL.createObjectURL(new Blob([page], { type: "text/html" }));
			window.open(url, "_blank", "noopener");
		}
		/**
		* Whether this browser can open a card in its own tab: an embedding host may
		* strip `window.open` or Blob URLs, and a page card then renders in place.
		* @returns true when both are available.
		*/
		function canOpenWindow() {
			return typeof window.open === "function" && typeof URL.createObjectURL === "function";
		}
		/** The frame variant a card's mode lays its document out for. */
		function variantOf(meta) {
			return meta.mode === "page" ? "page" : "card";
		}
		/** Whether the host UI is in Chinese; the plugin ships no locale catalogue. */
		function hostIsZh() {
			return document.documentElement.lang.toLowerCase().startsWith("zh");
		}
		/** Accessible name of the open control, in the host's language. */
		function openLabel() {
			return hostIsZh() ? "在新窗口打开" : "Open in new window";
		}
		/** Arrow-out-of-box glyph, sized to the 12px header text. */
		function OpenIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9.5 2.5h4v4" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13.5 2.5 7.5 8.5" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" })
				]
			});
		}
		const frameStyle$1 = {
			display: "block",
			width: "100%",
			border: 0,
			background: "transparent"
		};
		/** First text line of the durable result content, for the error row. */
		function firstResultLine(content) {
			for (const block of content) if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
				const newline = block.text.indexOf("\n");
				return newline === -1 ? block.text : block.text.slice(0, newline);
			}
			return "visualization failed";
		}
		/**
		* Re-render trigger for host theme switches: bumped whenever the host flips
		* appearance, so each frame document re-resolves the bridged palette.
		* @returns a counter that changes on every theme change.
		*/
		function useThemeTick() {
			const [themeTick, setThemeTick] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const bump = () => setThemeTick((tick) => tick + 1);
				const observer = new MutationObserver(bump);
				observer.observe(document.documentElement, { attributes: true });
				observer.observe(document.body, { attributes: true });
				const media = matchMedia("(prefers-color-scheme: dark)");
				media.addEventListener("change", bump);
				return () => {
					observer.disconnect();
					media.removeEventListener("change", bump);
				};
			}, []);
			return themeTick;
		}
		/**
		* The frame document for one card, rebuilt on theme changes.
		* @param meta - the card.
		* @param reportToken - height-report correlation token.
		* @param variant - surface the document lays out for.
		* @returns the srcdoc string and its scheme, for the iframe's own `color-scheme`.
		*/
		function useFrameDoc(meta, reportToken, variant, bridge = DETACHED) {
			const themeTick = useThemeTick();
			const { state, mode, version } = bridge;
			return (0, react.useMemo)(() => {
				const { themeVars, colorScheme } = resolveTheme();
				return {
					doc: buildFrameDoc({
						fragment: meta.fragment,
						title: meta.title,
						themeVars,
						colorScheme,
						reportToken,
						variant,
						style: meta.style,
						bridge: {
							state: state.current,
							mode
						}
					}),
					colorScheme
				};
			}, [
				meta,
				reportToken,
				variant,
				themeTick,
				state,
				mode,
				version
			]);
		}
		/** 无宿主时的桥：只读、状态 null。 */
		const DETACHED = {
			state: { current: null },
			mode: "detached"
		};
		/** 已读过的卡片状态，键为「会话 \n 路径」；同一张卡片在工具行与回合尾重复出现时共用。 */
		const stateCache = /* @__PURE__ */ new Map();
		/** 同一张卡片的其他实例：一处保存后通知其余实例用新状态重建 frame。 */
		const stateListeners = /* @__PURE__ */ new Map();
		/** 读状态最多等这么久，超时按 null 渲染。 */
		const STATE_LOAD_TIMEOUT_MS = 1500;
		/**
		* 读一张卡片保存的状态，并提供写入。没有宿主（无会话、流式中的卡片没有路径）时只读、为 null。
		* @param host - 会话的宿主能力。
		* @param meta - 卡片。
		* @returns 卡片状态。
		*/
		function useCardState(host, meta) {
			const key = host === void 0 || meta.path === "" ? void 0 : `${host.sessionId}\n${meta.path}`;
			const ref = (0, react.useRef)(key === void 0 ? null : stateCache.get(key) ?? null);
			const [ready, setReady] = (0, react.useState)(key === void 0 || stateCache.has(key));
			const [version, setVersion] = (0, react.useState)(0);
			const selfRef = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				if (key === void 0) return;
				const listener = (state) => {
					ref.current = state;
					setVersion((value) => value + 1);
				};
				selfRef.current = listener;
				let set = stateListeners.get(key);
				if (set === void 0) stateListeners.set(key, set = /* @__PURE__ */ new Set());
				set.add(listener);
				return () => {
					set.delete(listener);
					if (set.size === 0) stateListeners.delete(key);
				};
			}, [key]);
			(0, react.useEffect)(() => {
				if (key === void 0 || host === void 0 || stateCache.has(key)) {
					if (key !== void 0) ref.current = stateCache.get(key) ?? null;
					setReady(true);
					return;
				}
				let live = true;
				setReady(false);
				const done = (state) => {
					if (!live) return;
					ref.current = state;
					setReady(true);
				};
				const timer = setTimeout(() => done(null), STATE_LOAD_TIMEOUT_MS);
				host.loadState(meta.path).then((record) => {
					clearTimeout(timer);
					const state = record?.state ?? null;
					stateCache.set(key, state);
					done(state);
				}, () => {
					clearTimeout(timer);
					done(null);
				});
				return () => {
					live = false;
					clearTimeout(timer);
				};
			}, [
				key,
				host,
				meta.path
			]);
			const save = (0, react.useCallback)(async (next) => {
				if (key === void 0 || host === void 0) throw new BridgeError("unavailable", "this card has no saved state on this host");
				await host.saveState(meta.path, meta.title, next);
				stateCache.set(key, next);
				ref.current = next;
				for (const listener of stateListeners.get(key) ?? []) if (listener !== selfRef.current) listener(next);
			}, [
				key,
				host,
				meta.path,
				meta.title
			]);
			return {
				ready,
				version,
				state: ref,
				mode: key === void 0 ? "detached" : "live",
				save
			};
		}
		const overlayStyle = {
			position: "fixed",
			inset: 0,
			zIndex: 2147483e3,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: 16,
			background: "rgb(0 0 0 / 35%)"
		};
		const dialogStyle = {
			width: "min(480px, 100%)",
			maxHeight: "80vh",
			display: "flex",
			flexDirection: "column",
			gap: 12,
			padding: 20,
			borderRadius: 12,
			background: "var(--dsw-alias-bg-layer-1, #fff)",
			color: "var(--dsw-alias-label-primary, #1b1b1f)",
			border: "1px solid var(--dsw-alias-border-l2, rgb(127 127 127 / 25%))",
			boxShadow: "0 12px 40px rgb(0 0 0 / 25%)",
			fontSize: 14
		};
		const dialogBodyStyle = {
			margin: 0,
			padding: "10px 12px",
			borderRadius: 8,
			overflow: "auto",
			whiteSpace: "pre-wrap",
			wordBreak: "break-word",
			fontSize: 13,
			lineHeight: 1.5,
			background: "var(--dsw-alias-bg-base, rgb(127 127 127 / 8%))"
		};
		/** 确认框文案。 */
		function confirmLabels() {
			return hostIsZh() ? {
				heading: "卡片想替你发一条消息",
				note: "确认后将作为你的消息发送。",
				send: "发送",
				cancel: "取消",
				more: "…（已截断）"
			} : {
				heading: "The card wants to send a message for you",
				note: "It will be sent as your message.",
				send: "Send",
				cancel: "Cancel",
				more: "… (truncated)"
			};
		}
		/**
		* 追问确认框：在宿主页面上（frame 之外）显示标题、正文前 500 字与说明，模型代码点不到。
		* Esc 或点遮罩视为取消。
		*/
		function FollowUpDialog({ pending }) {
			const labels = confirmLabels();
			const sendRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				sendRef.current?.focus();
				const onKey = (event) => {
					if (event.key === "Escape") pending.settle(false);
				};
				addEventListener("keydown", onKey);
				return () => removeEventListener("keydown", onKey);
			}, [pending]);
			const preview = pending.prompt.length > 500 ? `${pending.prompt.slice(0, 500)}${labels.more}` : pending.prompt;
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: overlayStyle,
				"data-dsh-widget-confirm": "",
				onClick: (event) => {
					if (event.target === event.currentTarget) pending.settle(false);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					role: "dialog",
					"aria-modal": "true",
					"aria-label": labels.heading,
					style: dialogStyle,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 15,
								fontWeight: 600
							},
							children: pending.title ?? labels.heading
						}),
						pending.title !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 12,
								opacity: .65
							},
							children: labels.heading
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							style: dialogBodyStyle,
							children: preview
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 12,
								opacity: .75
							},
							children: labels.note
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								justifyContent: "flex-end",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: ghostButtonStyle,
								"data-action": "cancel",
								onClick: () => pending.settle(false),
								children: labels.cancel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								ref: sendRef,
								style: primaryButtonStyle$1,
								"data-action": "send",
								onClick: () => pending.settle(true),
								children: labels.send
							})]
						})
					]
				})
			}), document.body);
		}
		/** The sandboxed frame, sized to its content's reported height up to the mode's cap. */
		function SizedFrame({ meta, callId, card, host }) {
			const [height, setHeight] = (0, react.useState)(MIN_HEIGHT);
			const frameRef = (0, react.useRef)(null);
			const [pending, setPending] = (0, react.useState)(void 0);
			const { save } = card;
			(0, react.useEffect)(() => attachBridgeHost({
				token: callId,
				frame: () => frameRef.current?.contentWindow,
				handlers: {
					setState: save,
					async followUp({ prompt, title }) {
						if (host === void 0) throw new BridgeError("unavailable", "this card cannot send messages here");
						if (!await new Promise((resolve) => {
							setPending({
								prompt,
								title,
								settle(ok) {
									setPending(void 0);
									resolve(ok);
								}
							});
						})) throw new BridgeError("cancelled", "the user cancelled the follow-up");
						await host.send(`${FOLLOW_UP_MARK}${prompt}`);
					},
					async openExternal({ href }) {
						if (typeof window.open !== "function") throw new BridgeError("unavailable", "this host cannot open links");
						window.open(href, "_blank", "noopener,noreferrer");
					}
				}
			}), [
				callId,
				save,
				host
			]);
			(0, react.useEffect)(() => {
				const onMessage = (event) => {
					const data = event.data;
					if (typeof data !== "object" || data === null) return;
					const report = data;
					if (report.type !== "dsh-widget:height" || report.token !== callId) return;
					if (typeof report.height !== "number" || !Number.isFinite(report.height)) return;
					setHeight(Math.max(MIN_HEIGHT, Math.min(Math.ceil(report.height), HEIGHT_CAP[meta.mode])));
				};
				addEventListener("message", onMessage);
				return () => removeEventListener("message", onMessage);
			}, [callId, meta.mode]);
			const { doc, colorScheme } = useFrameDoc(meta, callId, variantOf(meta), card);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
				ref: frameRef,
				sandbox: FRAME_SANDBOX,
				referrerPolicy: "no-referrer",
				title: meta.title,
				srcDoc: doc,
				style: {
					...frameStyle$1,
					height,
					colorScheme
				}
			}, colorScheme), pending !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FollowUpDialog, { pending })] });
		}
		/**
		* The settled, well-formed card: header line plus the sandboxed frame, or a
		* page card's launcher. Every surface that shows a card — the toolview, the
		* turn tail, replay — goes through here, so a page card is a launcher in all
		* of them.
		*/
		function Frame({ meta, callId, host }) {
			const card = useCardState(host, meta);
			if (!card.ready) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					...headerStyle,
					minHeight: MIN_HEIGHT
				},
				children: meta.title
			});
			if (meta.mode === "page") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageLauncher, {
				meta,
				callId,
				card,
				host
			});
			const label = openLabel();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: cardStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: headerStyle,
					title: meta.path === "" ? meta.title : meta.path,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: titleStyle,
							children: meta.title
						}),
						meta.path !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: pathStyle$1,
							children: meta.path
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: openStyle,
							"aria-label": label,
							title: label,
							onClick: () => openInWindow(meta, callId, card.state.current),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenIcon, {})
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SizedFrame, {
					meta,
					callId,
					card,
					host
				})]
			});
		}
		/**
		* Thumbnail geometry: the page lays out in a desktop viewport and the frame
		* is scaled down to the launcher's width, then clipped to a fixed height, so
		* the reader sees the top of the real page rather than a reflowed narrow one.
		*/
		const THUMB_VIEWPORT_WIDTH = 1280;
		const THUMB_VIEWPORT_HEIGHT = 800;
		const THUMB_HEIGHT = 220;
		const hostBorder = "1px solid var(--dsw-alias-border-l2, rgb(127 127 127 / 25%))";
		const launcherStyle = {
			minWidth: 0,
			maxWidth: "100%",
			border: hostBorder,
			borderRadius: 10,
			overflow: "hidden"
		};
		const thumbStyle = {
			position: "relative",
			height: THUMB_HEIGHT,
			overflow: "hidden",
			cursor: "pointer",
			background: "var(--dsw-alias-bg-base, transparent)",
			borderBottom: hostBorder
		};
		const launcherBarStyle = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			gap: "8px 12px",
			padding: "10px 12px"
		};
		const launcherTextStyle = {
			flex: "1 1 220px",
			minWidth: 0
		};
		const oneLine = {
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		const launcherTitleStyle = {
			...oneLine,
			fontSize: 14,
			fontWeight: 500,
			lineHeight: 1.4
		};
		const launcherSummaryStyle = {
			...oneLine,
			fontSize: 12,
			lineHeight: 1.5,
			opacity: .65
		};
		const actionsStyle = {
			display: "flex",
			gap: 8,
			flexShrink: 0,
			marginLeft: "auto"
		};
		const buttonBase$1 = {
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			height: 30,
			padding: "0 12px",
			borderRadius: 8,
			font: "inherit",
			fontSize: 13,
			cursor: "pointer",
			whiteSpace: "nowrap"
		};
		const primaryButtonStyle$1 = {
			...buttonBase$1,
			border: "1px solid transparent",
			background: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, rgb(65 118 230))",
			color: "var(--dsw-alias-label-primary-inverted, rgb(255 255 255))",
			fontWeight: 500
		};
		const ghostButtonStyle = {
			...buttonBase$1,
			border: hostBorder,
			background: "transparent",
			color: "inherit"
		};
		/** Launcher strings, in the host's language. */
		function launcherLabels() {
			return hostIsZh() ? {
				open: "打开页面",
				show: "在对话中展开",
				hide: "收起",
				kind: "独立页面"
			} : {
				open: "Open page",
				show: "Show here",
				hide: "Collapse",
				kind: "Standalone page"
			};
		}
		/**
		* The live, inert thumbnail of a page: the same sandboxed page document, laid
		* out at desktop width and scaled into the launcher. Pointer events and focus
		* stay out of the frame, so it never takes a click, a scroll, or a tab stop;
		* a click on the thumbnail opens the page like the button does.
		*/
		function PageThumbnail({ meta, callId, onOpen, card }) {
			const wrapRef = (0, react.useRef)(null);
			const [width, setWidth] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const wrap = wrapRef.current;
				if (wrap === null) return;
				const measure = () => setWidth(wrap.clientWidth);
				measure();
				if (typeof ResizeObserver !== "function") return;
				const observer = new ResizeObserver(measure);
				observer.observe(wrap);
				return () => observer.disconnect();
			}, []);
			const thumbBridge = (0, react.useMemo)(() => ({
				state: card.state,
				mode: "detached"
			}), [card.state]);
			const { doc, colorScheme } = useFrameDoc(meta, `thumb:${callId}`, "page", thumbBridge);
			const scale = width > 0 ? width / THUMB_VIEWPORT_WIDTH : .5;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: wrapRef,
				style: thumbStyle,
				"aria-hidden": "true",
				onClick: onOpen,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					sandbox: FRAME_SANDBOX,
					referrerPolicy: "no-referrer",
					title: meta.title,
					srcDoc: doc,
					tabIndex: -1,
					style: {
						display: "block",
						position: "absolute",
						top: 0,
						left: 0,
						width: THUMB_VIEWPORT_WIDTH,
						height: THUMB_VIEWPORT_HEIGHT,
						border: 0,
						transform: `scale(${scale})`,
						transformOrigin: "0 0",
						pointerEvents: "none",
						colorScheme
					}
				}, colorScheme)
			});
		}
		/**
		* A page card in the conversation: not the page itself, which is built for a
		* whole tab, but a launcher for it. Opening is always the reader's click — a
		* tab opened without a user gesture is a blocked popup. Where no tab can be
		* opened at all, the page renders in place as a regular card.
		*/
		function PageLauncher({ meta, callId, card, host }) {
			const opens = canOpenWindow();
			const [expanded, setExpanded] = (0, react.useState)(!opens);
			const labels = launcherLabels();
			const open = opens ? () => openInWindow(meta, callId, card.state.current) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: launcherStyle,
				"data-visualize-launcher": "",
				children: [expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SizedFrame, {
					meta,
					callId,
					card,
					host
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PageThumbnail, {
					meta,
					callId,
					onOpen: open,
					card
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: launcherBarStyle,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: launcherTextStyle,
						title: meta.path === "" ? meta.title : meta.path,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: launcherTitleStyle,
							children: meta.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: launcherSummaryStyle,
							children: meta.summary ?? labels.kind
						})]
					}), open !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: actionsStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: ghostButtonStyle,
							"aria-expanded": expanded,
							onClick: () => setExpanded((on) => !on),
							children: expanded ? labels.hide : labels.show
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							style: primaryButtonStyle$1,
							onClick: open,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenIcon, {}), labels.open]
						})]
					})]
				})]
			});
		}
		/**
		* Keyed toolview for the `visualize` tool. Running calls and malformed or
		* failed results stay quiet single lines; a well-formed persisted meta — or
		* the fragment in the call's own arguments for nested dispatches — mounts
		* the frame.
		*/
		function VisualizeCard(props) {
			const { callId, block, widgetHost: host } = props;
			const argsRaw = "kind" in block ? block.call?.argsRaw : "argsRaw" in block ? block.argsRaw : void 0;
			if (!("kind" in block)) {
				const live = visualizeMetaFromArgs(argsRaw);
				if (live !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Frame, {
					meta: {
						...live,
						style: liveStyle()
					},
					callId,
					host
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: headerStyle,
					children: "Visualize · rendering…"
				});
			}
			if (block.isError) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: headerStyle,
				children: ["Visualize · ", firstResultLine(block.content)]
			});
			const persisted = visualizeMetaFrom(block.meta);
			if (persisted !== void 0) noteSettledStyle(persisted.style, argsRaw);
			const fromArgs = persisted === void 0 ? visualizeMetaFromArgs(argsRaw) : void 0;
			const meta = persisted ?? (fromArgs === void 0 ? void 0 : {
				...fromArgs,
				style: liveStyle()
			});
			if (meta === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: headerStyle,
				children: firstResultLine(block.content)
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Frame, {
				meta,
				callId,
				host
			});
		}
		//#endregion
		//#region src/client/StreamingPreview.tsx
		/**
		* Live streaming preview docked under the composer: while the model is still
		* generating a `visualize` call, the accumulated argument stream is parsed for
		* the fragment prefix and rendered into the same sandboxed frame the settled
		* card uses — complete scripts run, a still-open trailing script is held back
		* until its closing tag streams in (a half-streamed script body is almost
		* never valid JavaScript). Renders nothing when no `visualize` call is
		* streaming; once the call settles the preview unmounts and the transcript
		* card takes over.
		*
		* Source: from dsh 0.1.2 the session snapshot no longer carries the streaming
		* partial, and the host's own projections of the argument stream differ per
		* release (0.1.7 folds it into Assistant blocks that publish nothing for a
		* text-less step; 0.2.1 keeps it in the Tool node's lazy argument view). The
		* one shape stable across releases is the transient `assistant/live-chunk`
		* event itself, so a state-only Conversation Definition folds its
		* `tool-call-delta` chunks into Turn data, and the dock entry reads the open
		* Turn's value through the session-standard Chat selector. dsh 0.1.1 still
		* has the snapshot partial and no registry, and keeps reading it.
		*/
		/** Definition kind and Turn data key; namespaced by package to stay unique. */
		const STREAM_KEY = "dsh-widget-stream";
		const isIndex = (value) => Number.isSafeInteger(value) && value >= 0;
		const isRecord = (value) => typeof value === "object" && value !== null;
		const idOf = (value) => typeof value === "string" || typeof value === "number" ? String(value) : "";
		/**
		* Read an argument chunk (dsh-llm `StreamChunk`): a `tool-call-delta`, or the
		* `block-end` of a tool-call block.
		* @param chunk - the live chunk, unchecked.
		* @param step - the chunk's step.
		* @returns the checked chunk, or undefined for anything else or malformed.
		*/
		function callChunk(chunk, step) {
			if (!isRecord(chunk) || !isIndex(chunk.index)) return void 0;
			if (chunk.type === "tool-call-delta") return {
				step,
				index: chunk.index,
				id: idOf(chunk.id),
				name: typeof chunk.name === "string" ? chunk.name : void 0,
				text: typeof chunk.argumentsDelta === "string" ? chunk.argumentsDelta : "",
				final: false
			};
			const block = chunk.block;
			if (chunk.type !== "block-end" || !isRecord(block) || block.type !== "tool-call") return void 0;
			if (typeof block.arguments !== "string") return void 0;
			return {
				step,
				index: chunk.index,
				id: idOf(block.id),
				name: typeof block.name === "string" ? block.name : void 0,
				text: block.arguments,
				final: true
			};
		}
		/**
		* Classify an event without trusting its payload: a history window can begin
		* anywhere and a host may change shapes, and a throw here would abort the
		* host's whole conversation assembly, not just this preview.
		* @param event - any Session event the engine offers.
		* @returns the fold input, or undefined when unrelated or malformed.
		*/
		function streamInput(event) {
			const data = event.data;
			if (!isRecord(data) || !isIndex(data.turn)) return void 0;
			const turn = data.turn;
			if (event.type === "turn/start") return {
				kind: "turn",
				turn
			};
			if (event.type === "tool/call") return {
				kind: "call",
				turn,
				callId: idOf(data.callId)
			};
			if (event.type !== "assistant/live-chunk" || !isIndex(data.step)) return void 0;
			const chunk = callChunk(data.chunk, data.step);
			return chunk === void 0 ? void 0 : {
				kind: "chunk",
				turn,
				chunk
			};
		}
		/**
		* Fold one argument chunk. Later deltas of a call may omit its name and id,
		* so a call is addressed by step and content index, the way the provider
		* stream addresses it; a settled block replaces the accumulated text with
		* the authoritative arguments.
		* @param calls - calls so far.
		* @param chunk - the checked chunk.
		* @returns the next call list.
		*/
		function foldChunk(calls, chunk) {
			const slot = `${chunk.step}:${chunk.index}`;
			const at = calls.findIndex((call) => call.slot === slot);
			const previous = at === -1 ? void 0 : calls[at];
			const next = {
				slot,
				callId: previous?.callId || chunk.id,
				name: chunk.name ?? previous?.name ?? "",
				argsRaw: chunk.final ? chunk.text : (previous?.argsRaw ?? "") + chunk.text
			};
			return at === -1 ? [...calls, next] : calls.map((call, index) => index === at ? next : call);
		}
		/**
		* Apply one event. Total: unrelated or malformed input returns the state.
		* @param state - state so far.
		* @param event - the matched event.
		* @returns the next state.
		*/
		function reduceStream(state, event) {
			const input = streamInput(event);
			if (input?.kind === "chunk") return {
				...state,
				calls: foldChunk(state.calls, input.chunk)
			};
			if (input?.kind !== "call") return state;
			const calls = state.calls.filter((call) => call.callId !== input.callId);
			return calls.length === state.calls.length ? state : {
				...state,
				calls
			};
		}
		/**
		* Turn-local fold of the argument stream; it publishes Turn data and no view
		* Node. Live chunks are transient: when the Assistant message settles the
		* engine retires them and replays the Context without them, which empties the
		* value on its own; a durable `tool/call` also settles its call.
		*
		* Every accepted event is a start candidate. The engine rejects a start that
		* arrives on a Context already holding matches, and a history window can
		* begin at any event of a turn (a long turn loses its `turn/start`, keeps a
		* `tool/call`, and then streams again), so no event may be an update-only
		* match; the earliest loaded one opens the Context and the rest fold.
		*/
		const streamDefinition = {
			kind: STREAM_KEY,
			match: (event) => {
				const input = streamInput(event);
				return input === void 0 ? null : {
					id: String(input.turn),
					role: "start"
				};
			},
			start: (_context, match) => {
				return reduceStream({
					turn: streamInput(match.event)?.turn ?? 0,
					calls: []
				}, match.event);
			},
			update: (context, match) => reduceStream(context.state, match.event),
			publication: (match) => match.event.type === "assistant/live-chunk" ? "animation-frame" : "immediate",
			buildLocationData: (context, scope, previous) => {
				if (scope !== "turn" || context.state === void 0) return null;
				const { turn, calls } = context.state;
				let call;
				for (const candidate of calls) if (candidate.name === "visualize") call = candidate;
				if (call === void 0) return null;
				if (previous?.kind === "turn" && previous.turn === turn && previous.key === "dsh-widget-stream" && previous.value.callId === call.callId && previous.value.argsRaw === call.argsRaw) return previous;
				return {
					kind: "turn",
					turn,
					key: STREAM_KEY,
					value: {
						callId: call.callId,
						argsRaw: call.argsRaw
					}
				};
			}
		};
		/**
		* Flush interval for posting fragment updates into the persistent shell.
		* Updates are incremental DOM syncs, not reloads, so this can run near
		* per-delta speed; 150ms keeps the reveal continuous at negligible cost.
		*/
		const FLUSH_MS = 150;
		/**
		* Preview height ceiling. The frame tracks the shell's *measured* content
		* height (its height reports), so invisible early markup — style blocks,
		* empty containers — keeps the frame collapsed and painted components grow
		* it; the cap stops a tall fragment from crowding out the composer. Reserving
		* space no paint has claimed reads as a layout bug, not as anticipation.
		*/
		const PREVIEW_MAX_HEIGHT = 300;
		/**
		* The input dock spans the conversation view, not the composer column, so the
		* preview constrains itself to the composer's width family and centers.
		*/
		const wrapStyle = {
			margin: "6px auto 2px",
			maxWidth: 760,
			width: "100%"
		};
		const labelStyle = {
			fontSize: 12,
			opacity: .65,
			margin: "0 0 4px"
		};
		const frameStyle = {
			display: "block",
			width: "100%",
			border: 0,
			background: "transparent",
			transition: "height 240ms ease"
		};
		/**
		* Throttle a fast-changing string: re-emits at most every {@link FLUSH_MS},
		* with a trailing flush so the final value always lands. A plain trailing
		* debounce would starve under a continuous token stream — every delta would
		* reset the timer — so this flushes on the leading edge when the interval has
		* already elapsed.
		* @param value - the raw per-render value.
		* @returns the throttled value.
		*/
		function useThrottled(value) {
			const [shown, setShown] = (0, react.useState)(value);
			const lastFlush = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				const elapsed = Date.now() - lastFlush.current;
				if (elapsed >= FLUSH_MS) {
					lastFlush.current = Date.now();
					setShown(value);
					return;
				}
				const timer = setTimeout(() => {
					lastFlush.current = Date.now();
					setShown(value);
				}, FLUSH_MS - elapsed);
				return () => clearTimeout(timer);
			}, [value]);
			return shown;
		}
		/** The mounted preview, split out so hooks only run while a call streams. */
		function Preview({ argsRaw }) {
			const fragment = extractStreamingFragment(useThrottled(argsRaw));
			const preview = fragment === void 0 ? "" : trimStreamingScripts(fragment);
			const hasContent = preview.trim().length > 0;
			const frameRef = (0, react.useRef)(null);
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [contentHeight, setContentHeight] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const onMessage = (event) => {
					const report = event.data;
					if (report?.type !== "dsh-widget:height" || report.token !== "streaming-preview") return;
					if (typeof report.height !== "number" || !Number.isFinite(report.height)) return;
					setContentHeight(Math.max(0, Math.ceil(report.height)));
				};
				addEventListener("message", onMessage);
				return () => removeEventListener("message", onMessage);
			}, []);
			const { doc, colorScheme } = (0, react.useMemo)(() => {
				const theme = resolveTheme();
				return {
					doc: buildStreamShellDoc({
						...theme,
						reportToken: "streaming-preview",
						style: liveStyle()
					}),
					colorScheme: theme.colorScheme
				};
			}, []);
			(0, react.useEffect)(() => {
				if (!loaded || !hasContent) return;
				frameRef.current?.contentWindow?.postMessage({
					type: STREAM_MESSAGE_TYPE,
					token: "streaming-preview",
					fragment: preview
				}, "*");
			}, [
				loaded,
				hasContent,
				preview
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: wrapStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: labelStyle,
					children: hasContent ? "Visualize · streaming preview" : "Visualize · composing…"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					ref: frameRef,
					sandbox: "allow-scripts",
					referrerPolicy: "no-referrer",
					title: "Visualization streaming preview",
					srcDoc: doc,
					style: {
						...frameStyle,
						colorScheme,
						height: hasContent ? Math.min(contentHeight, PREVIEW_MAX_HEIGHT) : 0
					},
					onLoad: () => setLoaded(true)
				})]
			});
		}
		const NO_SOURCE = {
			getSnapshot: () => void 0,
			subscribe: () => () => void 0
		};
		/**
		* The latest Turn's stream source. A Location's data store is observable on
		* its own, so the Chat selector only tracks which Turn is latest and every
		* argument delta reaches the preview without re-reading the Chat snapshot.
		* @param timeline - the Chat target's Turn/Step facts; older hosts may omit it.
		* @returns the source, or undefined before any Turn or without a data store.
		*/
		function latestStreamSource(timeline) {
			const turn = timeline?.turnOrder.at(-1);
			const location = turn === void 0 ? void 0 : timeline?.turns.get(turn);
			return typeof location?.data?.source === "function" ? location.data.source(STREAM_KEY) : void 0;
		}
		/** Dock body on hosts with the Conversation registry (dsh 0.1.2+). */
		function TurnStream({ useChat }) {
			const source = useChat((snapshot) => latestStreamSource(snapshot?.timeline)) ?? NO_SOURCE;
			const stream = (0, react.useSyncExternalStore)(source.subscribe, source.getSnapshot);
			if (stream === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Preview, { argsRaw: stream.argsRaw }, stream.callId);
		}
		/**
		* Dock entry: mounts the preview exactly while a `visualize` call streams.
		*/
		function StreamingPreview({ session, useChat }) {
			if (typeof useChat === "function") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnStream, { useChat });
			const blocks = session?.partial?.blocks;
			if (blocks === void 0) return null;
			let argsRaw;
			for (const block of blocks) if (block.kind === "tool-call" && block.name === "visualize") argsRaw = block.argsRaw;
			if (argsRaw === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Preview, { argsRaw });
		}
		//#endregion
		//#region src/client/folding.ts
		/** Settings namespace owned by the host Chat target. */
		const CHAT_NAMESPACE = "ui-chat";
		/**
		* Whether a saved mode folds on a 0.1.7+ host. An unset value is the host's
		* `standard` default.
		* @param view - saved `transcriptView`.
		* @returns true unless the reader chose `verbose`.
		*/
		function configFormsFolds(view) {
			return view !== "verbose";
		}
		/**
		* Whether a saved mode folds on a 0.1.2–0.1.6 host. An unset value is the
		* host's `compact` default.
		* @param view - saved `transcriptView`.
		* @returns true for `compact` or unset.
		*/
		function settingsScopeFolds(view) {
			return view === void 0 || view === "compact";
		}
		/**
		* Adapt a settings face into a boolean observable.
		* @param face - the host namespace binding.
		* @param folds - the generation's mode rule.
		* @returns an observable whose snapshot is a primitive, so it is stable.
		*/
		function observe(face, folds) {
			return {
				getSnapshot: () => folds(face.getSnapshot().value?.transcriptView),
				subscribe: (listener) => {
					const dispose = face.subscribe(listener);
					return typeof dispose === "function" ? dispose : () => void 0;
				}
			};
		}
		/**
		* Narrow an unknown value to an object exposing a method.
		* @param value - candidate service.
		* @param method - required method name.
		* @returns the value when it carries the method.
		*/
		function hasMethod(value, method) {
			return typeof value === "object" && value !== null && typeof value[method] === "function";
		}
		/**
		* Resolve the folding observable for this host. Call it once the Chat target
		* is up (its turn-tail declaration is the signal), when both settings
		* services, where present, are already provided.
		* @param host - the client context, read through optional `get`.
		* @returns whether finished turns currently fold, observed live.
		*/
		function foldingSource(host) {
			const forms = host.get("configForms");
			if (hasMethod(forms, "get")) return observe(forms.get(CHAT_NAMESPACE), configFormsFolds);
			const scope = host.get("settingsScope");
			if (hasMethod(scope, "bind")) return observe(scope.bind({ namespace: CHAT_NAMESPACE }), settingsScopeFolds);
			return {
				getSnapshot: () => false,
				subscribe: () => () => void 0
			};
		}
		//#endregion
		//#region src/client/TurnCards.tsx
		/** Definition kind and Turn data key; namespaced by package to stay unique. */
		const TURN_CARDS_KEY = "dsh-widget";
		/**
		* Accept a successful root `visualize` result. The persisted meta names its
		* own kind, so no call-to-name bookkeeping is needed.
		* @param data - `tool/result` payload.
		* @returns the card descriptor, or undefined when unrelated or failed.
		*/
		function resultMeta(data) {
			return data.message.isError === true ? void 0 : visualizeMetaFrom(data.meta);
		}
		/**
		* Fold one result into the turn's cards. A repeated call id (a later surface
		* replacement of the same result) keeps the first; a later card at an existing
		* path (an `update` patch) replaces that card in place, so a corrected card is
		* shown once, in its original position.
		* @param cards - cards so far.
		* @param card - the incoming card.
		* @returns the next card list, or the same list when unchanged.
		*/
		function foldCard(cards, card) {
			if (cards.some((existing) => existing.callId === card.callId)) return cards;
			const index = cards.findIndex((existing) => existing.meta.path === card.meta.path);
			if (index === -1) return [...cards, card];
			return cards.map((existing, at) => at === index ? card : existing);
		}
		/** Turn-local visualize accumulator; it publishes Turn data and no view Node. */
		const turnCardsDefinition = {
			kind: TURN_CARDS_KEY,
			match: (event) => {
				if (event.type === "turn/start") return {
					id: String(event.data.turn),
					role: "start"
				};
				if (event.type !== "tool/result") return null;
				const data = event.data;
				return resultMeta(data) === void 0 ? null : {
					id: String(data.turn),
					role: "update"
				};
			},
			start: (_context, match) => {
				if (match.event.type !== "turn/start") throw new Error("dsh-widget: turn cards start requires turn/start");
				return {
					turn: match.event.data.turn,
					cards: []
				};
			},
			update: (context, match) => {
				if (match.event.type !== "tool/result") return context.state;
				const data = match.event.data;
				const meta = resultMeta(data);
				if (meta === void 0) return context.state;
				const cards = foldCard(context.state.cards, {
					callId: String(data.message.source.callId),
					seq: match.event.seq,
					meta
				});
				return cards === context.state.cards ? context.state : {
					...context.state,
					cards
				};
			},
			buildLocationData: (context, scope, previous) => {
				if (scope !== "turn" || context.state === void 0) return null;
				const { turn, cards } = context.state;
				if (previous?.kind === "turn" && previous.turn === turn && previous.key === "dsh-widget" && previous.value.cards === cards) return previous;
				return {
					kind: "turn",
					turn,
					key: TURN_CARDS_KEY,
					value: { cards }
				};
			}
		};
		/**
		* The cards settled before the turn's closing reply.
		* @param turn - the closing turn; older hosts may omit its data store.
		* @param seq - the closing assistant message's sequence number.
		* @returns the cards to show, possibly empty.
		*/
		function cardsBefore(turn, seq) {
			return (turn?.data?.get("dsh-widget")?.cards ?? []).filter((card) => card.seq < seq);
		}
		/**
		* Chain selector for dsh 0.1.5 and earlier, whose turn tail elects one entry.
		* @param owner - the turn-tail owner currency.
		* @returns the cards as the match, or null to decline this turn.
		*/
		function selectTurnCards(owner) {
			const cards = cardsBefore(owner.turn, owner.seq);
			return cards.length === 0 ? null : cards;
		}
		/** A grid track sized `minmax(0, 1fr)`: an `auto` track would grow to a card's min-content. */
		const listStyle = {
			display: "grid",
			gridTemplateColumns: "minmax(0, 1fr)",
			gap: 12,
			margin: "8px 0 4px",
			minWidth: 0
		};
		/**
		* Turn-tail entry. A list turn tail mounts it on every turn, so it declines
		* turns without cards itself, and it stays empty whenever the host is not
		* folding — the toolview card is then already in view.
		* @param props - turn owner props plus the injected folding selector.
		* @returns the turn's cards, or null.
		*/
		function TurnCards({ turn, seq, useVisualizeFolds, widgetHost }) {
			const folds = useVisualizeFolds((value) => value);
			const cards = cardsBefore(turn, seq);
			if (!folds || cards.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: listStyle,
				children: cards.map((card) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Frame, {
					meta: card.meta,
					callId: `turn-tail:${card.callId}`,
					host: widgetHost
				}, card.callId))
			});
		}
		//#endregion
		//#region src/client/settings-locale.ts
		/** English copy and key source. */
		const EN = {
			styleHeading: "Card style",
			styleIntro: "New cards use this style. Cards already in a conversation keep the style they were made in.",
			"style.whale": "Whale",
			"style.whale.desc": "Matches the dsh interface",
			"style.editorial": "Editorial",
			"style.editorial.desc": "Headline states the finding, one story line",
			"style.paper": "Paper",
			"style.paper.desc": "Like a figure in a paper",
			"style.sketch": "Sketch",
			"style.sketch.desc": "Hand drawn, like a whiteboard",
			"style.terminal": "Terminal",
			"style.terminal.desc": "Monospaced, like a terminal",
			defaultTag: "Default",
			saving: "Saving…",
			saved: "Saved. The next card uses {style}.",
			saveFailed: "Could not save the style. Try again.",
			readOnly: "This profile cannot be edited from here.",
			overridden: "Set in your profile",
			reset: "Use the default",
			unavailableTitle: "This dsh cannot change the card style here",
			unavailableBody: "Set it in {path} instead:",
			previewTitle: "Signups up 18% this week",
			previewNote: "Weekly signups, last 8 weeks",
			filesHeading: "Custom style files",
			filesIntro: "Notes the model reads after the built-in style, such as colours or wording to prefer. The workspace file is read last. Each file counts up to {max} bytes.",
			globalFile: "All workspaces",
			workspaceFile: "Workspace",
			workspacePick: "Workspace",
			fileExists: "Exists",
			fileMissing: "Not created",
			fileBlocked: "This path is a link or not a regular file, so it cannot be edited here.",
			bytes: "{bytes} / {max} bytes",
			tooLarge: "Over the {max}-byte limit by {over} bytes.",
			saveFile: "Save",
			fileSaved: "Saved. It applies from the next skill load.",
			fileRemoved: "Saved empty, so the file was removed.",
			fileSaveFailed: "Could not save the file: {reason}",
			filesUnavailable: "This dsh cannot edit the files here. Edit them directly:",
			filesLoading: "Loading style files…",
			placeholder: "For example: use teal for the accent, label axes in English."
		};
		/** Chinese copy. */
		const ZH = {
			styleHeading: "卡片风格",
			styleIntro: "新生成的卡片用这个风格。对话里已有的卡片保持它生成时的风格。",
			"style.whale": "鲸蓝",
			"style.whale.desc": "和 dsh 界面一致",
			"style.editorial": "报刊",
			"style.editorial.desc": "标题写结论，一条主线",
			"style.paper": "论文",
			"style.paper.desc": "论文插图式",
			"style.sketch": "手绘",
			"style.sketch.desc": "白板手绘",
			"style.terminal": "终端",
			"style.terminal.desc": "等宽终端风",
			defaultTag: "默认",
			saving: "保存中…",
			saved: "已保存，下一张卡片用「{style}」。",
			saveFailed: "风格没有保存成功，请重试。",
			readOnly: "这个配置不能在这里修改。",
			overridden: "已在配置中设置",
			reset: "恢复默认",
			unavailableTitle: "这个版本的 dsh 不能在这里切换卡片风格",
			unavailableBody: "请在 {path} 里设置：",
			previewTitle: "本周注册量上涨 18%",
			previewNote: "近 8 周每周注册量",
			filesHeading: "自定义风格文件",
			filesIntro: "模型在内置风格之后读的补充说明，比如偏好的颜色或措辞；工作区文件最后读。每个文件最多计入 {max} 字节。",
			globalFile: "所有工作区",
			workspaceFile: "工作区",
			workspacePick: "工作区",
			fileExists: "已存在",
			fileMissing: "未创建",
			fileBlocked: "这个路径是链接或不是普通文件，不能在这里编辑。",
			bytes: "{bytes} / {max} 字节",
			tooLarge: "超出 {max} 字节上限 {over} 字节。",
			saveFile: "保存",
			fileSaved: "已保存，下次加载 skill 时生效。",
			fileRemoved: "内容为空，已删除该文件。",
			fileSaveFailed: "文件没有保存成功：{reason}",
			filesUnavailable: "这个版本的 dsh 不能在这里编辑这些文件，请直接编辑：",
			filesLoading: "正在读取风格文件…",
			placeholder: "例如：强调色用青绿色，坐标轴标签用英文。"
		};
		/**
		* Map a host locale id to the page's language.
		* @param active - the host's active locale id, if known.
		* @returns English only for an `en` locale; everything else reads Chinese.
		*/
		function settingsLang(active) {
			return active !== void 0 && active.toLowerCase().startsWith("en") ? "en" : "zh";
		}
		/**
		* The page language without a locale service, from the document.
		* @returns the language.
		*/
		function documentLang() {
			const lang = typeof document === "undefined" ? "" : document.documentElement.lang;
			return lang === "" ? "zh" : settingsLang(lang);
		}
		/** Fill `{name}` placeholders. */
		function fill(text, params) {
			return params === void 0 ? text : text.replace(/\{(\w+)\}/gu, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
		}
		/**
		* Build the translate function for one language.
		* @param lang - the language.
		* @returns the translate function.
		*/
		function translator(lang) {
			const dict = lang === "en" ? EN : ZH;
			return (key, params) => fill(dict[key], params);
		}
		/** The display name of a style. */
		function styleName(t, id) {
			return t(`style.${id}`);
		}
		//#endregion
		//#region src/client/VisualizeSection.tsx
		/**
		* The plugin's page in the host's settings dialog (「设置」→「可视化」): the
		* card style picker and the user's style files.
		*
		* The style is the plugin's `style` config field, edited through the host's
		* own settings form for this entry (`ctx.configForms.get('dsh-widget')`,
		* backed by dsh-settings): a save lands in the profile's `cordis.patch.yml`
		* and the running plugin reads it on its next card, with no restart. Where
		* the host has no such form the page says where to set it by hand.
		*
		* Each option shows a live preview: a small sample card built by the real
		* frame builder in that style and the host's current theme, in the same
		* sandbox as a card. The style files go through the plugin's own route on the
		* host `/api` channel (style-files.ts).
		*
		* Laid out like dsh-ads' settings page so the two plugin pages read as
		* siblings: inline rules, neutral alpha borders, inherited text colour.
		*
		* @module
		*/
		/** The page's own rules: states inline styles cannot express. */
		const SECTION_CSS = `
.dshviz-option { position: relative; display: flex; flex-direction: column; min-width: 0; border: 1px solid rgba(128, 128, 128, 0.28); border-radius: 10px; overflow: hidden; cursor: pointer; transition: border-color 120ms ease, box-shadow 120ms ease; }
.dshviz-option:hover { border-color: rgba(128, 128, 128, 0.5); }
.dshviz-option[data-selected='true'] { border-color: #2f6fed; box-shadow: 0 0 0 1px #2f6fed; }
.dshviz-option:has(input:focus-visible) { outline: 2px solid #2f6fed; outline-offset: 2px; }
.dshviz-option[data-disabled='true'] { cursor: default; opacity: 0.6; }
.dshviz-radio { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }
.dshviz-textarea:focus-visible, .dshviz-select:focus-visible, .dshviz-button:focus-visible { outline: 2px solid #2f6fed; outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) { .dshviz-option { transition: none; } }
`;
		/** Install the page rules once per document. */
		function useSectionCss() {
			(0, react.useEffect)(() => {
				const id = "@lbryany/dsh-widget/settings.css";
				if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return;
				const tag = document.createElement("style");
				tag.dataset.plugin = "@lbryany/dsh-widget";
				tag.dataset.pluginCss = id;
				tag.textContent = SECTION_CSS;
				document.head.append(tag);
			}, []);
		}
		const divider = "1px solid rgba(128, 128, 128, 0.22)";
		const headingStyle = {
			fontSize: 15,
			lineHeight: 1.4,
			fontWeight: 500
		};
		const blurbStyle = {
			fontSize: 13,
			lineHeight: 1.5,
			opacity: .55,
			marginTop: 2
		};
		const gridStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
			gap: 12,
			marginTop: 12
		};
		const previewStyle = {
			display: "block",
			width: "100%",
			height: 124,
			border: 0,
			background: "transparent",
			pointerEvents: "none"
		};
		const optionTextStyle = {
			padding: "8px 10px 10px",
			borderTop: divider
		};
		const optionNameStyle = {
			display: "flex",
			alignItems: "center",
			gap: 6,
			fontSize: 14,
			fontWeight: 500
		};
		const tagStyle = {
			fontSize: 11,
			lineHeight: "16px",
			padding: "0 6px",
			borderRadius: 999,
			background: "rgba(128, 128, 128, 0.16)",
			fontWeight: 400
		};
		const noticeStyle = {
			marginTop: 12,
			padding: "10px 12px",
			borderRadius: 8,
			background: "rgba(128, 128, 128, 0.12)",
			fontSize: 13,
			lineHeight: 1.6
		};
		const codeStyle = {
			margin: "6px 0 0",
			padding: "8px 10px",
			borderRadius: 6,
			background: "rgba(128, 128, 128, 0.12)",
			fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
			fontSize: 12,
			lineHeight: 1.6,
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere"
		};
		const statusStyle = {
			fontSize: 13,
			lineHeight: 1.5,
			marginTop: 8,
			minHeight: 20
		};
		const buttonBase = {
			padding: "7px 14px",
			borderRadius: 8,
			fontSize: 13,
			fontFamily: "inherit",
			cursor: "pointer"
		};
		const primaryButtonStyle = {
			...buttonBase,
			border: "1px solid #2f6fed",
			background: "#2f6fed",
			color: "#fff"
		};
		const quietButtonStyle = {
			...buttonBase,
			padding: "3px 10px",
			border: "1px solid rgba(128, 128, 128, 0.35)",
			background: "transparent",
			color: "inherit"
		};
		const textareaStyle = {
			display: "block",
			width: "100%",
			boxSizing: "border-box",
			minHeight: 120,
			marginTop: 8,
			padding: "8px 10px",
			border: "1px solid rgba(128, 128, 128, 0.35)",
			borderRadius: 8,
			background: "transparent",
			color: "inherit",
			fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
			fontSize: 13,
			lineHeight: 1.5,
			resize: "vertical"
		};
		const selectStyle = {
			minHeight: 30,
			maxWidth: "100%",
			padding: "0 8px",
			border: "1px solid rgba(128, 128, 128, 0.35)",
			borderRadius: 8,
			background: "transparent",
			color: "inherit",
			font: "inherit",
			fontSize: 13
		};
		const pathStyle = {
			fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
			fontSize: 12,
			opacity: .6,
			overflowWrap: "anywhere"
		};
		/**
		* The sample card every option previews: a headline, a note and a small line
		* chart drawn with the frame's own tokens, so colours, type, radius, grid and
		* line weight all come from the style.
		* @param t - translate function, for the sample's text.
		* @returns the fragment.
		*/
		function previewFragment(t) {
			const escape = (text) => text.replace(/[&<>"]/gu, (char) => `&#${char.charCodeAt(0)};`);
			const line = "fill:none;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke";
			return `<div class="card" style="padding:10px 12px">
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
<h3 style="margin:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(t("previewTitle"))}</h3>
<span class="viz-badge">+18%</span>
</div>
<div class="text-small" style="margin:2px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(t("previewNote"))}</div>
<svg viewBox="0 0 220 54" width="100%" height="54" preserveAspectRatio="none" aria-hidden="true">
<line x1="0" y1="18" x2="220" y2="18" style="stroke:var(--viz-grid);stroke-width:1;stroke-dasharray:var(--viz-grid-dash);vector-effect:non-scaling-stroke"/>
<line x1="0" y1="36" x2="220" y2="36" style="stroke:var(--viz-grid);stroke-width:1;stroke-dasharray:var(--viz-grid-dash);vector-effect:non-scaling-stroke"/>
<line x1="0" y1="53" x2="220" y2="53" style="stroke:var(--viz-axis);stroke-width:1;vector-effect:non-scaling-stroke"/>
<polyline points="0,47 31,45 63,46 94,42 126,43 157,40 189,41 220,37" style="${line};stroke:var(--viz-series-2);stroke-width:var(--viz-line-width)"/>
<polyline points="0,42 31,38 63,40 94,31 126,28 157,22 189,17 220,8" style="${line};stroke:var(--viz-series-1);stroke-width:var(--viz-line-width)"/>
</svg>
</div>`;
		}
		/**
		* One option's live preview: the sample through the real frame builder, in
		* this style and the host's current theme, inert like a page thumbnail.
		*/
		function StylePreview({ id, t }) {
			const themeTick = useThemeTick();
			const { doc, colorScheme } = (0, react.useMemo)(() => {
				const { themeVars, colorScheme } = resolveTheme();
				return {
					doc: buildFrameDoc({
						fragment: previewFragment(t),
						title: styleName(t, id),
						themeVars,
						colorScheme,
						reportToken: `settings-preview:${id}`,
						style: id
					}),
					colorScheme
				};
			}, [
				id,
				t,
				themeTick
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
				sandbox: FRAME_SANDBOX,
				referrerPolicy: "no-referrer",
				title: styleName(t, id),
				srcDoc: doc,
				tabIndex: -1,
				"aria-hidden": "true",
				scrolling: "no",
				style: {
					...previewStyle,
					colorScheme
				}
			}, colorScheme);
		}
		/** The configured style the node half put on this page, when known. */
		function pageStyle() {
			const config = globalThis[PAGE_CONFIG_GLOBAL];
			return typeof config?.style === "string" ? styleIdFrom(config.style) : void 0;
		}
		/**
		* Tell this page's not-yet-settled cards the new style, which the node half
		* otherwise writes only when it serves the page.
		* @param style - the saved style.
		*/
		function setPageStyle(style) {
			const globals = globalThis;
			const previous = globals[PAGE_CONFIG_GLOBAL];
			globals[PAGE_CONFIG_GLOBAL] = {
				...typeof previous === "object" && previous !== null ? previous : {},
				style
			};
		}
		const UNAVAILABLE = {
			status: "unavailable",
			value: void 0,
			user: void 0,
			writable: false
		};
		/** Follow a form's snapshot; a missing form reads as unavailable. */
		function useFormSnapshot(form) {
			return (0, react.useSyncExternalStore)(form?.subscribe.bind(form) ?? noSubscribe, form === void 0 ? () => UNAVAILABLE : () => form.getSnapshot());
		}
		function noSubscribe() {
			return () => {};
		}
		/** Whether the user layer sets the style. */
		function userSetsStyle(user) {
			return typeof user === "object" && user !== null && Object.hasOwn(user, "style");
		}
		/** The style picker. */
		function StylePicker({ form, t }) {
			const snapshot = useFormSnapshot(form);
			const headingId = (0, react.useId)();
			const name = (0, react.useId)();
			const [pending, setPending] = (0, react.useState)(void 0);
			const [notice, setNotice] = (0, react.useState)(void 0);
			const accepted = snapshot.status === "ready" ? styleIdFrom(snapshot.value?.style) : void 0;
			(0, react.useEffect)(() => {
				if (accepted !== void 0 && accepted !== pageStyle()) setPageStyle(accepted);
			}, [accepted]);
			const unavailable = form === void 0 || snapshot.status === "unavailable";
			const selected = pending ?? accepted ?? pageStyle() ?? "whale";
			const disabled = unavailable || snapshot.status !== "ready" || !snapshot.writable;
			/**
			* Write, then report the style the host now holds: the chosen one, or after
			* a reset (`chosen` undefined) whatever the profile inherits, which the form
			* knows once it has answered.
			*/
			const run = async (write, chosen) => {
				setPending(chosen ?? "whale");
				setNotice(void 0);
				try {
					const ok = await write();
					const held = chosen ?? styleIdFrom(form?.getSnapshot().value?.style);
					if (ok) setPageStyle(held);
					setNotice(ok ? {
						ok,
						text: t("saved", { style: styleName(t, held) })
					} : {
						ok,
						text: t("saveFailed")
					});
				} catch {
					setNotice({
						ok: false,
						text: t("saveFailed")
					});
				} finally {
					setPending(void 0);
				}
			};
			const choose = (id) => {
				if (form === void 0 || disabled || id === selected) return;
				run(() => form.set("style", id), id);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				"aria-labelledby": headingId,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: headingId,
						style: headingStyle,
						children: t("styleHeading")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: blurbStyle,
						children: t("styleIntro")
					}),
					unavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: noticeStyle,
						role: "note",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: { fontWeight: 500 },
								children: t("unavailableTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("unavailableBody", { path: "<DSH_HOME>/profiles/web/cordis.patch.yml" }) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
								style: codeStyle,
								children: `- id: dsh-widget\n  name: "@lbryany/dsh-widget"\n  config:\n    style: ${selected}`
							})
						]
					}),
					!unavailable && snapshot.status === "ready" && !snapshot.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: noticeStyle,
						role: "note",
						children: t("readOnly")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "radiogroup",
						"aria-labelledby": headingId,
						style: gridStyle,
						children: STYLE_IDS.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dshviz-option",
							"data-style": id,
							"data-selected": id === selected,
							"data-disabled": disabled,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dshviz-radio",
									type: "radio",
									name,
									value: id,
									checked: id === selected,
									disabled,
									onChange: () => choose(id)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StylePreview, {
									id,
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: optionTextStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: optionNameStyle,
										children: [
											styleName(t, id),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													...pathStyle,
													opacity: .5,
													fontSize: 11
												},
												children: id
											}),
											id === "whale" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: tagStyle,
												children: t("defaultTag")
											})
										]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											...blurbStyle,
											marginTop: 0
										},
										children: t(`style.${id}.desc`)
									})]
								})
							]
						}, id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...statusStyle,
							display: "flex",
							alignItems: "center",
							gap: 10,
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							role: "status",
							style: {
								color: notice !== void 0 && !notice.ok ? "#c2382c" : "inherit",
								opacity: notice?.ok === false ? 1 : .7
							},
							children: pending !== void 0 ? t("saving") : notice?.text ?? ""
						}), form !== void 0 && !disabled && userSetsStyle(snapshot.user) && pending === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								...blurbStyle,
								marginTop: 0
							},
							children: t("overridden")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dshviz-button",
							style: quietButtonStyle,
							onClick: () => void run(() => form.unset("style"), void 0),
							children: t("reset")
						})] })]
					})
				]
			});
		}
		/** One style file's editor. */
		function FileEditor({ file, max, t, files, onSaved }) {
			const [draft, setDraft] = (0, react.useState)(file.text);
			const [saving, setSaving] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(void 0);
			const textareaId = (0, react.useId)();
			(0, react.useEffect)(() => setDraft(file.text), [file.path, file.text]);
			const bytes = new TextEncoder().encode(draft).byteLength;
			const over = bytes - max;
			const blocked = file.blocked !== void 0;
			const save = async () => {
				setSaving(true);
				setNotice(void 0);
				try {
					const result = await files.save({
						scope: file.scope,
						...file.workspaceId === void 0 ? {} : { workspaceId: file.workspaceId },
						text: draft
					});
					if (result.ok) {
						onSaved(result.file);
						setNotice({
							ok: true,
							text: result.file.exists ? t("fileSaved") : t("fileRemoved")
						});
					} else setNotice({
						ok: false,
						text: t("fileSaveFailed", { reason: result.reason })
					});
				} finally {
					setSaving(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						flexWrap: "wrap",
						marginTop: 4
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						htmlFor: textareaId,
						style: pathStyle,
						children: file.path
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: tagStyle,
						children: file.exists ? t("fileExists") : t("fileMissing")
					})]
				}),
				blocked && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: noticeStyle,
					role: "note",
					children: t("fileBlocked")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
					id: textareaId,
					className: "dshviz-textarea",
					style: textareaStyle,
					value: draft,
					readOnly: blocked,
					spellCheck: false,
					placeholder: t("placeholder"),
					"aria-invalid": over > 0 || void 0,
					onChange: (event) => setDraft(event.target.value)
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 12,
						marginTop: 8,
						flexWrap: "wrap"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12,
							color: over > 0 ? "#c2382c" : "inherit",
							opacity: over > 0 ? 1 : .55
						},
						children: over > 0 ? t("tooLarge", {
							max,
							over
						}) : t("bytes", {
							bytes,
							max
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dshviz-button",
						style: {
							...primaryButtonStyle,
							opacity: blocked || saving || over > 0 || draft === file.text ? .5 : 1
						},
						disabled: blocked || saving || over > 0 || draft === file.text,
						onClick: () => void save(),
						children: saving ? t("saving") : t("saveFile")
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "status",
					style: {
						...statusStyle,
						color: notice !== void 0 && !notice.ok ? "#c2382c" : "inherit",
						opacity: notice?.ok === false ? 1 : .7
					},
					children: notice?.text ?? ""
				})
			] });
		}
		/** The style files. */
		function StyleFiles({ files, t }) {
			const [view, setView] = (0, react.useState)(void 0);
			const [workspaceId, setWorkspaceId] = (0, react.useState)(void 0);
			const headingId = (0, react.useId)();
			const selectId = (0, react.useId)();
			(0, react.useEffect)(() => {
				let live = true;
				files.load().then((loaded) => {
					if (live) setView(loaded ?? null);
				}, () => {
					if (live) setView(null);
				});
				return () => {
					live = false;
				};
			}, [files]);
			const replace = (next) => setView((current) => current === null || current === void 0 ? current : {
				...current,
				files: current.files.map((file) => file.path === next.path ? next : file)
			});
			const max = view?.maxBytes ?? 4096;
			const global = view?.files.find((file) => file.scope === "global");
			const workspaces = view?.files.filter((file) => file.scope === "workspace") ?? [];
			const workspace = workspaces.find((file) => file.workspaceId === workspaceId) ?? workspaces[0];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				"aria-labelledby": headingId,
				style: {
					marginTop: 18,
					paddingTop: 18,
					borderTop: divider
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: headingId,
						style: headingStyle,
						children: t("filesHeading")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: blurbStyle,
						children: t("filesIntro", { max })
					}),
					view === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...blurbStyle,
							marginTop: 12
						},
						children: t("filesLoading")
					}),
					view === null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: noticeStyle,
						role: "note",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("filesUnavailable") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							style: codeStyle,
							children: "<DSH_HOME>/widget/style.md\n<workspace>/.dsh/visualize-style.md"
						})]
					}),
					global !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { marginTop: 14 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 14,
								fontWeight: 500
							},
							children: t("globalFile")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileEditor, {
							file: global,
							max,
							t,
							files,
							onSaved: replace
						})]
					}),
					workspace !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							marginTop: 14,
							paddingTop: 14,
							borderTop: divider
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 10,
								flexWrap: "wrap"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: selectId,
								style: {
									fontSize: 14,
									fontWeight: 500
								},
								children: t("workspaceFile")
							}), workspaces.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								id: selectId,
								className: "dshviz-select",
								style: selectStyle,
								value: workspace.workspaceId,
								onChange: (event) => setWorkspaceId(event.target.value),
								children: workspaces.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: file.workspaceId,
									children: file.title ?? file.path
								}, file.workspaceId))
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								id: selectId,
								style: {
									fontSize: 13,
									opacity: .7
								},
								children: workspace.title ?? ""
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileEditor, {
							file: workspace,
							max,
							t,
							files,
							onSaved: replace
						}, workspace.path)]
					})
				]
			});
		}
		/**
		* Draw the settings page.
		* @param props - see {@link VisualizeSectionProps}.
		* @returns the section content column.
		*/
		function VisualizeSection({ lang, form, files }) {
			useSectionCss();
			const t = (0, react.useMemo)(() => translator(lang), [lang]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StylePicker, {
					form,
					t
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StyleFiles, {
					files,
					t
				})]
			});
		}
		//#endregion
		//#region src/client/settings.tsx
		/** The plugin's profile entry id, which names its settings form. */
		const ENTRY_ID = "dsh-widget";
		/** Section id in the settings dialog. */
		const SECTION_ID = "dsh-widget";
		/**
		* Look a service up without declaring it.
		* @param ctx - client context.
		* @param name - service name.
		* @returns the service, or undefined.
		*/
		function lookup(ctx, name) {
			try {
				return ctx.get(name);
			} catch {
				return;
			}
		}
		/**
		* The locale service when it has the shape the page reads.
		* @param ctx - client context.
		* @returns the service, or undefined.
		*/
		function localeOf(ctx) {
			const locale = lookup(ctx, "locale");
			return typeof locale?.getSnapshot === "function" && typeof locale.subscribe === "function" ? locale : void 0;
		}
		/**
		* The host form for this plugin's entry, when the host has settings forms.
		* @param ctx - client context.
		* @returns the form, or undefined.
		*/
		function styleFormOf(ctx) {
			const forms = lookup(ctx, "configForms");
			if (typeof forms?.get !== "function") return void 0;
			const form = forms.get(ENTRY_ID);
			return typeof form?.getSnapshot === "function" && typeof form.subscribe === "function" && typeof form.set === "function" ? form : void 0;
		}
		/**
		* The style-file route over the page's own fetch, resolved against the
		* document like the host's other `/api` routes, so a mounted app path keeps
		* working; the browser's session cookie authenticates it.
		* @param fetchImpl - fetch to use.
		* @param base - base URL the route resolves against.
		* @returns the client.
		*/
		function styleFilesClient(fetchImpl = fetch, base = () => document.baseURI) {
			const url = () => new URL(STYLE_FILES_PATH.slice(1), base()).href;
			return {
				async load() {
					const response = await fetchImpl(url(), {
						credentials: "same-origin",
						headers: { accept: "application/json" }
					});
					if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return void 0;
					const view = await response.json();
					return Array.isArray(view.files) && typeof view.maxBytes === "number" ? view : void 0;
				},
				async save(request) {
					try {
						const response = await fetchImpl(url(), {
							method: "POST",
							credentials: "same-origin",
							headers: {
								"content-type": "application/json",
								accept: "application/json"
							},
							body: JSON.stringify(request)
						});
						const body = await response.json().catch(() => ({}));
						if (response.ok) return {
							ok: true,
							file: body
						};
						return {
							ok: false,
							reason: typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : `HTTP ${response.status}`
						};
					} catch (error) {
						return {
							ok: false,
							reason: error instanceof Error ? error.message : String(error)
						};
					}
				}
			};
		}
		/**
		* The section entry the host mounts.
		* @param props - the injected locale hook, form and route client.
		* @returns the page.
		*/
		function VisualizeSectionEntry({ useLocale, form, files }) {
			const lang = useLocale === void 0 ? documentLang() : useLocale((snapshot) => settingsLang(snapshot.active));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VisualizeSection, {
				lang,
				form,
				files
			});
		}
		/**
		* Register the settings page.
		* @param ctx - client root context.
		*/
		function registerSettingsSection(ctx) {
			const slots = ctx.slots;
			const files = styleFilesClient();
			slots.inject("settings.section", () => {
				const locale = localeOf(ctx);
				const lang = () => locale === void 0 ? documentLang() : settingsLang(locale.getSnapshot().active);
				return slots.register({
					name: "settings.section",
					id: SECTION_ID,
					order: 95,
					label: () => lang() === "en" ? "Visualize" : "可视化",
					inject: () => ({
						...locale === void 0 ? {} : { hooks: { locale } },
						form: styleFormOf(ctx),
						files
					})
				}, VisualizeSectionEntry);
			});
		}
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-widget";
		const inject = ["slots"];
		/**
		* Look up the Conversation event registry without declaring the service, so
		* hosts that predate it still load the plugin.
		* @param host - client context.
		* @returns the registry, or undefined on dsh 0.1.1.
		*/
		function conversationEvents(host) {
			const service = host.get("uiConversation");
			return typeof service?.events?.register === "function" ? service.events : void 0;
		}
		/**
		* Turn-tail registration valid on both slot shapes the host has shipped: dsh
		* 0.1.5 and earlier declare a chain (register requires `select`, orders by
		* `priority`), 0.1.6 onward a list (register requires `id`, orders by
		* `order`). Each register validates only its own kind's field. The cards sit
		* after the host's deliverables and before other plugins' low-rank entries.
		* @param host - client context, for the folding preference.
		* @returns the register options.
		*/
		function turnTailOptions(host, hostOf) {
			const folds = foldingSource(host);
			return {
				name: "conversation.chat.turnTail",
				id: "dsh-widget-cards",
				order: 100,
				priority: 100,
				select: selectTurnCards,
				inject: (sessionId) => ({
					hooks: { visualizeFolds: folds },
					widgetHost: hostOf(sessionId)
				})
			};
		}
		/**
		* Register the keyed toolview, the dock preview with its stream Definition,
		* the turn-tail cards, and the settings page. Waiting on each hole's declaration mirrors the
		* official registrants: entry application order is loader-driven, and a
		* direct register racing the declaration fails boot.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const states = stateClient();
			const hosts = /* @__PURE__ */ new Map();
			const hostOf = (sessionId) => {
				if (typeof sessionId !== "string") return void 0;
				if (!hosts.has(sessionId)) hosts.set(sessionId, widgetHostFor(ctx, sessionId, states));
				return hosts.get(sessionId);
			};
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "visualize",
				inject: (sessionId) => ({ widgetHost: hostOf(sessionId) })
			}, VisualizeCard));
			ctx.inject(["uiConversation"], (scope) => {
				conversationEvents(scope)?.register(streamDefinition);
			});
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "visualize-stream",
				order: 30
			}, StreamingPreview));
			ctx.slots.inject("conversation.chat.turnTail", () => {
				const events = conversationEvents(ctx);
				if (events === void 0) return () => void 0;
				const disposeDefinition = events.register(turnCardsDefinition);
				const disposeTail = ctx.slots.register(turnTailOptions(ctx, hostOf), TurnCards);
				return () => {
					disposeTail();
					disposeDefinition();
				};
			});
			registerSettingsSection(ctx);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
