/**
 * Formatação para a tela (apresentação, não domínio): datas relativas e
 * tamanhos em português, sempre a partir de um `now` explícito para os testes.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:02" no fuso do navegador. */
export function clock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "05/11" ou "05/11/2025" se for de outro ano. */
export function shortDate(date: Date, now: Date): string {
  const base = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base}/${date.getFullYear()}`;
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
}

/** "agora", "há 4 min", "há 2 h", "ontem às 14:02" ou "05/11 às 14:02". */
export function timeAgo(iso: string, now: Date): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return "agora";
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
  if (diff < 12 * HOUR) return `há ${Math.floor(diff / HOUR)} h`;
  if (date.toDateString() === now.toDateString()) return `hoje às ${clock(date)}`;
  if (isYesterday(date, now)) return `ontem às ${clock(date)}`;
  return `${shortDate(date, now)} às ${clock(date)}`;
}

/** Quanto falta: "23 h 12 min", "40 min", "menos de 1 min". */
function remaining(ms: number): string {
  if (ms < MINUTE) return "menos de 1 min";
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (hours === 0) return `${minutes} min`;
  if (hours >= 48) return `${Math.floor(ms / DAY)} dias`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

type Deadline = { status: "active" | "expired"; kept: boolean; expiresAt: string | null };

/** Curto, para a lista: "expira em 23 h", "mantida", "expirou há 2 h". */
export function deadlineShort(inbox: Deadline, now: Date): string {
  if (inbox.status === "expired") return inbox.expiresAt ? `expirou ${timeAgo(inbox.expiresAt, now)}` : "expirada";
  if (inbox.kept || !inbox.expiresAt) return "mantida";
  const ms = new Date(inbox.expiresAt).getTime() - now.getTime();
  return `expira em ${ms >= HOUR ? `${Math.floor(ms / HOUR)} h` : remaining(ms)}`;
}

/** Completo, para o cabeçalho da Caixa: "Expira em 23 h 12 min", "Mantida, sem prazo". */
export function deadlineLong(inbox: Deadline, now: Date): string {
  if (inbox.status === "expired") {
    return inbox.expiresAt ? `Expirou ${timeAgo(inbox.expiresAt, now)}` : "Expirada";
  }
  if (inbox.kept || !inbox.expiresAt) return "Mantida, sem prazo";
  return `Expira em ${remaining(new Date(inbox.expiresAt).getTime() - now.getTime())}`;
}

/** "12 KB", "1,4 MB". */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
