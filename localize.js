(() => {
    "use strict";
    if (window.wan2gpZhCN) return;
    const dictionary = Object.assign(Object.create(null), __WAN2GP_ZH_CN_DICTIONARY__);
    const storageKey = "wan2gp.zh-cn.language";
    const scope = ".gradio-container, gradio-app, .toast-wrap, .hierarchy-selector-panel, .wangp-model-info-popup, [role='tooltip'], [role='alert'], [role='dialog'], [role='listbox'], #assistant_chat_dock";
    const protectedContent = [
        "[translate='no']", ".notranslate", "[data-zh-cn-skip]", "[contenteditable]:not([contenteditable='false'])",
        ".chat__transcript", ".chat__attachment", ".chat__session-picker option",
        ".generation-prompt-cell", ".generation-reference", ".file-preview", ".file-name", ".filename",
        ".orig_name", ".gallery-item .caption", "a[download]", "#gallery .caption",
        ".hierarchy-selector-chip-text", ".hierarchy-search-name", ".hierarchy-search-path",
        ".hierarchy-tree-name", ".hierarchy-item", ".hierarchy-folder",
        ...["family_list", "model_base_types_list", "model_list"].flatMap(id => [
            `#${id} .wrap`, `#${id} input`, `#${id} [role='option']`, `#${id} .token`, `#${id} option`
        ]),
        ".model-name", "#wangp_model_search_results", ".json-holder", ".code", "pre",
        // Headings use inline code for UI button names such as Add Mask, not program source.
        "code:not(h1 code, h2 code, h3 code, h4 code)", "script", "style",
        "#wan2gp-zh-cn-toggle", ".wan2gp-zh-cn-selected-label"
    ].join(",");
    const textExcluded = `${protectedContent}, input, textarea, select, option, svg, canvas`;
    const attributeNames = ["title", "aria-label", "placeholder", "label"];
    const originals = new Map();
    const dropdowns = new Map();
    const editingDropdowns = new WeakSet();
    const pending = new Set();
    let language = "zh-CN", frame = 0, prune = false, destroyed = false;
    try { if (localStorage.getItem(storageKey) === "en") language = "en"; }
    catch (error) { console.warn("[zh-CN] 无法读取语言偏好", error); }

    function translate(text) {
        if (typeof text !== "string" || !text.trim()) return text;
        const key = text.trim().replace(/\s+/g, " ");
        let translated = dictionary[key];
        if (!translated) {
            // Only known labels: never replace individual words in arbitrary user content.
            const decorated = key.match(/^([^A-Za-z0-9\u4e00-\u9fff]+)\s*(.+)$/u);
            if (decorated && dictionary[decorated[2]]) translated = decorated[1] + dictionary[decorated[2]];
            const numbered = key.match(/^(Guidance|Guidance2|Guidance3|Phase|Voice to follow|ControlNet Weight)\s*(#?\d+)?(\s*\(CFG\))?$/);
            if (!translated && numbered && dictionary[numbered[1]]) {
                translated = dictionary[numbered[1]] + (numbered[2] ? ` ${numbered[2]}` : "") + (numbered[3] || "");
            }
            const fps = key.match(/^Override Frames Per Second \(model default=([\d.]+) fps\)$/);
            if (fps) translated = `覆盖帧率（模型默认 ${fps[1]} fps）`;
            const length = key.match(/^Video Length \(([^()]+)\)$/);
            if (length) translated = `视频长度（${length[1]}）`;
            const preload = key.match(/^(Video|Image|Audio|Text) (VRAM Preload \(MB\)|- Default Memory Profile)$/);
            if (preload) translated = dictionary[preload[1]] + " - " + dictionary[preload[2]];
            const ratio = key.match(/^Fit into a (\d+:\d+) Box$/);
            if (ratio) translated = `适配 ${ratio[1]} 画框`;
            const speed = key.match(/^around x([\d.]+) speed up$/);
            if (speed) translated = `约 ${speed[1]} 倍加速`;
            const dynamic = [
                [/^Configuration was not saved: ([\s\S]+)$/, "设置未保存："],
                [/^Unsupported remux method: (.+)$/, "不支持的重新封装方式："],
                [/^Task ID (.+) has been updated successfully\.$/, "任务 ID ", " 已更新。"],
                [/^(.+) must be an integer\.$/, "", "必须为整数。"],
                [/^(.+) must be a number\.$/, "", "必须为数字。"]
            ];
            for (const [pattern, before, after = ""] of dynamic) {
                const match = key.match(pattern);
                if (!translated && match) translated = before + (dictionary[match[1]] || match[1]) + after;
            }
        }
        return translated ? text.replace(/\S[\s\S]*\S|\S/, () => translated) : text;
    }

    function isUI(element) { return !!element && !!element.closest(scope); }

    function localizeField(node, field) {
        const current = field === "text" ? node.nodeValue : node.getAttribute(field);
        if (current === null) return;
        const entry = originals.get(node)?.get(field);
        if (entry && current === entry.translated) return;
        const translated = translate(current);
        if (translated === current) {
            if (entry) originals.get(node).delete(field);
            return;
        }
        if (!originals.has(node)) originals.set(node, new Map());
        originals.get(node).set(field, { original: current, translated });
        if (field === "text") node.nodeValue = translated;
        else node.setAttribute(field, translated);
    }

    function localizeElement(element) {
        if (!isUI(element) || element.closest(protectedContent)) return;
        if (element.tagName === "OPTION") { localizeOption(element); return; }
        for (const attribute of attributeNames) localizeField(element, attribute);
    }

    function localizeOption(option) {
        const fields = originals.get(option);
        const entry = fields?.get("label");
        const current = option.getAttribute("label");
        const original = entry && current === entry.translated ? entry.original : current;
        // Native option.label changes only its display; implicit option.value still uses original text.
        const source = original ?? option.text;
        const translated = translate(source);
        if (translated === source) {
            if (entry && current === entry.translated) {
                if (original === null) option.removeAttribute("label");
                else option.setAttribute("label", original);
                fields.delete("label");
            }
            return;
        }
        if (!fields) originals.set(option, new Map());
        originals.get(option).set("label", { original, translated });
        if (current !== translated) option.setAttribute("label", translated);
    }

    function removeDropdown(input, entry) {
        input.classList.remove("wan2gp-zh-cn-selected-input");
        entry.overlay.remove();
        if (!entry.parent.querySelector(".wan2gp-zh-cn-selected-label")) entry.parent.classList.remove("wan2gp-zh-cn-selected-host");
        dropdowns.delete(input);
    }

    function refreshDropdowns() {
        for (const [input, entry] of dropdowns) {
            if (!input.isConnected || input.parentElement !== entry.parent) removeDropdown(input, entry);
        }
        if (language !== "zh-CN") return;
        for (const input of document.querySelectorAll('input[role="listbox"], input[role="combobox"]')) {
            if (!isUI(input) || input.closest(protectedContent)) continue;
            const translated = translate(input.value);
            const show = translated !== input.value && input.value && (input.readOnly || !editingDropdowns.has(input));
            let entry = dropdowns.get(input);
            if (!show) { if (entry) removeDropdown(input, entry); continue; }
            if (!entry) {
                const parent = input.parentElement;
                const overlay = document.createElement("span");
                overlay.className = "wan2gp-zh-cn-selected-label";
                overlay.setAttribute("aria-hidden", "true");
                parent.classList.add("wan2gp-zh-cn-selected-host");
                parent.appendChild(overlay);
                entry = { overlay, parent };
                dropdowns.set(input, entry);
            }
            input.classList.remove("wan2gp-zh-cn-selected-input");
            const style = getComputedStyle(input);
            entry.overlay.style.cssText = `left:${input.offsetLeft}px;top:${input.offsetTop}px;width:${input.offsetWidth}px;height:${input.offsetHeight}px;padding:${style.padding};font:${style.font};line-height:${input.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)}px;color:${style.color};`;
            if (entry.overlay.textContent !== translated) entry.overlay.textContent = translated;
            input.classList.add("wan2gp-zh-cn-selected-input");
        }
    }

    function localizeTree(root) {
        if (root.nodeType === Node.TEXT_NODE) {
            if (root.parentElement?.tagName === "OPTION") { localizeElement(root.parentElement); return; }
            if (isUI(root.parentElement) && !root.parentElement.closest(textExcluded)) localizeField(root, "text");
            return;
        }
        if (root.nodeType !== Node.ELEMENT_NODE) return;
        localizeElement(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (node.nodeType === Node.ELEMENT_NODE && node.matches(protectedContent)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.nodeType === Node.ELEMENT_NODE) localizeElement(node);
            else if (isUI(node.parentElement) && !node.parentElement.closest(textExcluded)) localizeField(node, "text");
        }
    }

    function restore() {
        for (const [node, fields] of originals) {
            for (const [field, entry] of fields) {
                const current = field === "text" ? node.nodeValue : node.getAttribute(field);
                if (current !== entry.translated) continue;
                if (field === "text") node.nodeValue = entry.original;
                else if (entry.original === null) node.removeAttribute(field);
                else node.setAttribute(field, entry.original);
            }
        }
        originals.clear();
        for (const [input, entry] of dropdowns) removeDropdown(input, entry);
    }

    function observe() {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: attributeNames });
    }

    function flush() {
        frame = 0;
        observer.disconnect();
        try {
            if (prune) {
                for (const node of originals.keys()) if (!node.isConnected) originals.delete(node);
                prune = false;
            }
            if (language === "zh-CN") {
                for (const node of pending) if (node.isConnected) localizeTree(node);
                refreshDropdowns();
            }
        } catch (error) { console.error("[zh-CN] 界面汉化失败", error); }
        finally { pending.clear(); if (!destroyed) observe(); }
    }

    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === "childList") {
                if (record.removedNodes.length) prune = true;
                for (const node of record.addedNodes) pending.add(node);
            } else pending.add(record.target);
        }
        if (!frame) frame = requestAnimationFrame(flush);
    });

    const toggle = document.createElement("button");
    const style = document.createElement("style");
    style.textContent = ".wan2gp-zh-cn-selected-host{position:relative!important}.wan2gp-zh-cn-selected-input{color:transparent!important;-webkit-text-fill-color:transparent!important}.wan2gp-zh-cn-selected-label{position:absolute;box-sizing:border-box;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--body-text-color,#222);z-index:1}";
    toggle.id = "wan2gp-zh-cn-toggle";
    toggle.type = "button";
    toggle.style.cssText = "position:fixed;right:12px;top:12px;z-index:900;min-height:36px;padding:6px 12px;border:1px solid #8b8b8b;border-radius:6px;background:var(--background-fill-primary,#fff);color:var(--body-text-color,#222);font:14px system-ui;cursor:pointer;box-shadow:0 1px 5px #0002";
    function updateToggle() {
        toggle.textContent = language === "zh-CN" ? "简体中文 · EN" : "English · 中文";
        toggle.title = language === "zh-CN" ? "切换为英文界面" : "Switch to Simplified Chinese";
        toggle.setAttribute("aria-label", toggle.title);
    }

    function setLanguage(next) {
        if (destroyed || !["en", "zh-CN"].includes(next)) return;
        // Drain app mutations before restoring, so stale translations never overwrite newer labels.
        const queued = observer.takeRecords();
        for (const record of queued) if (record.removedNodes?.length) prune = true;
        observer.disconnect();
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        pending.clear();
        language = next;
        try {
            restore();
            if (language === "zh-CN") { localizeTree(document.body); refreshDropdowns(); }
        } catch (error) { console.error("[zh-CN] 切换语言失败", error); }
        finally { observe(); updateToggle(); }
        try { localStorage.setItem(storageKey, language); }
        catch (error) { console.warn("[zh-CN] 无法保存语言偏好", error); }
        console.info(`[zh-CN] 界面语言=${language}`);
    }
    toggle.addEventListener("click", () => setLanguage(language === "zh-CN" ? "en" : "zh-CN"));
    function scheduleDropdowns(event) {
        if (event?.target instanceof HTMLInputElement) {
            if (event.type === "input") editingDropdowns.add(event.target);
            else if (event.type === "focusin" || event.type === "focusout") editingDropdowns.delete(event.target);
        }
        if (!frame && !destroyed) frame = requestAnimationFrame(flush);
    }
    // ponytail: 250 ms polling catches Svelte property-only value updates without patching its value setter.
    const dropdownTimer = setInterval(scheduleDropdowns, 250);
    const dropdownEvents = ["input", "change", "focusin", "focusout"];
    for (const event of dropdownEvents) document.addEventListener(event, scheduleDropdowns, true);
    window.wan2gpZhCN = {
        translate, setLanguage, get language() { return language; },
        destroy() {
            destroyed = true;
            clearInterval(dropdownTimer);
            for (const event of dropdownEvents) document.removeEventListener(event, scheduleDropdowns, true);
            observer.disconnect();
            if (frame) cancelAnimationFrame(frame);
            pending.clear(); restore(); toggle.remove(); style.remove();
            delete window.wan2gpZhCN;
        }
    };
    function start() {
        if (destroyed) return;
        document.head.appendChild(style);
        document.body.appendChild(toggle);
        updateToggle();
        if (language === "zh-CN") { localizeTree(document.body); refreshDropdowns(); }
        observe();
        console.info(`[zh-CN] 汉化包就绪：${Object.keys(dictionary).length} 条词条，语言=${language}`);
    }
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
