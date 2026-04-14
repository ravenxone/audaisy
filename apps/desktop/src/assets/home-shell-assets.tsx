import audaisyLogo from "@/assets/brand/audaisy-logo.png";
import deleteIcon from "@/assets/icons/delete-02.svg";
import downloadIcon from "@/assets/icons/download-circle-01.svg";
import homeIcon from "@/assets/icons/home-07.svg";
import noteIcon from "@/assets/icons/note.svg";
import penToolIcon from "@/assets/icons/pen-tool-03.svg";
import sidebarCollapsedIcon from "@/assets/icons/sidebar-left.svg";
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
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
    <path d="M12 4.2 13.1 2.4 15.7 3.4 15.9 5.8 17.8 7 20.1 6 21.2 8.6 19.3 10.2 19.3 13.8 21.2 15.4 20.1 18 17.8 17 15.9 18.2 15.7 20.6 13.1 21.6 12 19.8 10.9 21.6 8.3 20.6 8.1 18.2 6.2 17 3.9 18 2.8 15.4 4.7 13.8 4.7 10.2 2.8 8.6 3.9 6 6.2 7 8.1 5.8 8.3 3.4 10.9 2.4 12 4.2Z" stroke="#6D5700" stroke-width="1.7" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3.3" stroke="#6D5700" stroke-width="1.7"/>
  </svg>
`)}`;

export const homeShellAssets: {
  brand: { daisy: HomeShellImageAsset };
  shell: {
    toggle: {
      expanded: HomeShellImageAsset;
      collapsed: HomeShellImageAsset;
    };
    home: HomeShellImageAsset;
    trash: HomeShellImageAsset;
    activeJobs: HomeShellImageAsset;
    downloads: HomeShellImageAsset;
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
      expanded: {
        src: sidebarToggleIcon,
      },
      collapsed: {
        src: sidebarCollapsedIcon,
      },
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
    downloads: {
      src: downloadIcon,
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
