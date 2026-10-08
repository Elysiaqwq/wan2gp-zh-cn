(() => {
    "use strict";
    if (window.wan2gpZhCN) return;
    const dictionary = __WAN2GP_ZH_CN_DICTIONARY__;
    const storageKey = "wan2gp.zh-cn.language";
    const scope = ".gradio-container, gradio-app, .toast-wrap, .hierarchy-selector-panel, [role='dialog'], [role='listbox'], #assistant_chat_dock";
    const protectedContent = [
        "[translate='no']", ".notranslate", "[data-zh-cn-skip]", "[contenteditable]:not([contenteditable='false'])",
        ".chat__transcript", ".chat__attachment", ".chat__session-picker option",
        ".generation-prompt-cell", ".generation-reference", ".file-preview", ".file-name", ".filename",
        ".orig_name", ".gallery-item .caption", "a[download]", "#gallery .caption",
        ".hierarchy-selector-chip-text", ".hierarchy-search-name", ".hierarchy-search-path",
        ".hierarchy-tree-name", ".hierarchy-item", ".hierarchy-folder",
        "#family_list", "#model_base_types_list", "#model_list", "#wangp_model_search_results",
        ".header-markdown-group", ".code", "pre", "code", "script", "style",
        "#wan2gp-zh-cn-toggle"
    ].join(",");
    const textExcluded = `${protectedContent}, input, textarea, select, option, svg, canvas`;
    const attributeNames = ["title", "aria-label", "placeholder"];
    const originals = new Map();
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
        for (const attribute of attributeNames) localizeField(element, attribute);
    }

    function localizeTree(root) {
        if (root.nodeType === Node.TEXT_NODE) {
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
                else node.setAttribute(field, entry.original);
            }
        }
        originals.clear();
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
            if (language === "zh-CN") localizeTree(document.body);
        } catch (error) { console.error("[zh-CN] 切换语言失败", error); }
        finally { observe(); updateToggle(); }
        try { localStorage.setItem(storageKey, language); }
        catch (error) { console.warn("[zh-CN] 无法保存语言偏好", error); }
        console.info(`[zh-CN] 界面语言=${language}`);
    }
    toggle.addEventListener("click", () => setLanguage(language === "zh-CN" ? "en" : "zh-CN"));
    window.wan2gpZhCN = {
        translate, setLanguage, get language() { return language; },
        destroy() {
            destroyed = true;
            observer.disconnect();
            if (frame) cancelAnimationFrame(frame);
            pending.clear(); restore(); toggle.remove();
            delete window.wan2gpZhCN;
        }
    };
    function start() {
        if (destroyed) return;
        document.body.appendChild(toggle);
        updateToggle();
        if (language === "zh-CN") localizeTree(document.body);
        observe();
        console.info(`[zh-CN] 汉化包就绪：${Object.keys(dictionary).length} 条词条，语言=${language}`);
    }
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
