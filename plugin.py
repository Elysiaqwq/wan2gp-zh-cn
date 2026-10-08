import json
import logging
from pathlib import Path

from shared.utils.plugins import WAN2GPPlugin


class SimplifiedChinesePlugin(WAN2GPPlugin):
    def __init__(self):
        super().__init__()
        self.name = "简体中文汉化包"
        self.version = "1.2.0"
        self.description = "本地简体中文界面汉化，支持中英文切换。"
        self.type = ["extension"]

    def setup_ui(self):
        folder = Path(__file__).resolve().parent
        try:
            translations = json.loads((folder / "zh_CN.json").read_text(encoding="utf-8"))
            if not isinstance(translations, dict) or not translations or any(
                not isinstance(key, str) or not key.strip() or
                not isinstance(value, str) or not value.strip()
                for key, value in translations.items()
            ):
                raise ValueError("zh_CN.json 必须是非空的英文到中文字符串词典")
            script = (folder / "localize.js").read_text(encoding="utf-8")
            marker = "__WAN2GP_ZH_CN_DICTIONARY__"
            if script.count(marker) != 1:
                raise ValueError("localize.js 词典占位符缺失或重复")
            self.add_custom_js(script.replace(marker, json.dumps(translations, ensure_ascii=True)))
            logging.getLogger(__name__).info(
                "[zh-CN] 汉化插件已加载：version=%s entries=%d path=%s",
                self.version, len(translations), folder,
            )
        except Exception:
            logging.getLogger(__name__).exception("[zh-CN] 汉化插件加载失败：path=%s", folder)
            raise
