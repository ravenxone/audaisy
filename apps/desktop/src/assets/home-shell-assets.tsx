import audaisyLogo from "@/assets/brand/audaisy-logo.png";
import deleteIcon from "@/assets/icons/delete-02.svg";
import homeIcon from "@/assets/icons/home-07.svg";
import noteIcon from "@/assets/icons/note.svg";
import penToolIcon from "@/assets/icons/pen-tool-03.svg";
import sidebarToggleIcon from "@/assets/icons/sidebar-left-01.svg";
import stickyNoteIcon from "@/assets/icons/sticky-note-03.svg";

export type AvatarOption = {
  id: string;
  emoji: string;
  background: string;
};

type HomeShellImageAsset = {
  src: string;
};

const settingsFallback = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none">
    <path d="M6 1.5 6.5 2.4 7.6 2.1 8 3.1 7.2 3.9 7.8 4.7 8.9 4.5 9.3 5.5 8.4 6.1 8.4 6.9 9.3 7.5 8.9 8.5 7.8 8.3 7.2 9.1 8 9.9 7.6 10.9 6.5 10.6 6 11.5 5.5 10.6 4.4 10.9 4 9.9 4.8 9.1 4.2 8.3 3.1 8.5 2.7 7.5 3.6 6.9 3.6 6.1 2.7 5.5 3.1 4.5 4.2 4.7 4.8 3.9 4 3.1 4.4 2.1 5.5 2.4 6 1.5Z" stroke="#6D5700" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="6" cy="6" r="1.7" stroke="#6D5700" stroke-width="1"/>
  </svg>
`)}`;

export const homeShellAssets: {
  brand: { daisy: HomeShellImageAsset };
  shell: {
    toggle: HomeShellImageAsset;
    home: HomeShellImageAsset;
    trash: HomeShellImageAsset;
    activeJobs: HomeShellImageAsset;
    sampleProject: HomeShellImageAsset;
    startSomethingNew: HomeShellImageAsset;
    documentation: HomeShellImageAsset;
    settings: HomeShellImageAsset;
  };
} = {
  brand: {
    daisy: {
      src: audaisyLogo,
    },
  },
  shell: {
    toggle: {
      src: sidebarToggleIcon,
    },
    home: {
      src: homeIcon,
    },
    trash: {
      src: deleteIcon,
    },
    activeJobs: {
      src: penToolIcon,
    },
    sampleProject: {
      src: noteIcon,
    },
    startSomethingNew: {
      src: stickyNoteIcon,
    },
    documentation: {
      src: noteIcon,
    },
    settings: {
      src: settingsFallback,
    },
  },
};

export const avatarOptions: AvatarOption[] = [
  { id: "sunflower-avatar", emoji: "🌼", background: "#FFF0A8" },
  { id: "strawberry-avatar", emoji: "🍓", background: "#F9D6E5" },
  { id: "leaf-avatar", emoji: "🌿", background: "#D8F3DC" },
  { id: "moon-avatar", emoji: "🌙", background: "#DDE7FF" },
  { id: "star-avatar", emoji: "⭐", background: "#FFE5B4" },
  { id: "cloud-avatar", emoji: "☁️", background: "#E1F2FF" },
  { id: "orange-avatar", emoji: "🍊", background: "#FFD8BE" },
  { id: "blossom-avatar", emoji: "🌸", background: "#FFD9EC" },
  { id: "shell-avatar", emoji: "🐚", background: "#F6E7D8" },
  { id: "sparkle-avatar", emoji: "✨", background: "#E9D8FD" },
  { id: "lemon-avatar", emoji: "🍋", background: "#FFF6BF" },
  { id: "clover-avatar", emoji: "🍀", background: "#D7F0C8" },
  { id: "blueberry-avatar", emoji: "🫐", background: "#D6E4FF" },
];

export function resolveAvatarOption(avatarId: string | null) {
  return avatarOptions.find((option) => option.id === avatarId) ?? avatarOptions[0];
}
