import React from "react";
import type { OfficeHost } from "@pvta/shared";
import { SUGGESTIONS, type Lang } from "./i18n";
import { Icon } from "./Icon";

const icons: Record<OfficeHost, string[]> = {
  word: ["file", "exam", "diff", "palette"],
  excel: ["grade", "search", "palette", "shuffle"],
  powerpoint: ["slides", "file", "exam", "diff"],
};
const tones = ["indigo", "violet", "amber", "emerald"];

/** Chọn thẻ điền yêu cầu để giáo viên bổ sung trước khi gửi. */
export function WelcomeActions({ host, lang, onChoose }: {
  host: OfficeHost;
  lang: Lang;
  onChoose: (prompt: string) => void;
}) {
  return (
    <div className="addin-bento-mini">
      {SUGGESTIONS[lang][host].map((prompt, index) => (
        <button type="button" key={prompt} className={`bento-mini-btn ${tones[index]}`}
          onClick={() => onChoose(prompt)}>
          <Icon name={icons[host][index]!} /> <span>{prompt}</span>
        </button>
      ))}
    </div>
  );
}
