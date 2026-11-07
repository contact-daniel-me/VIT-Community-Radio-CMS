import { useState } from 'react';
import { usePwa } from '@/hooks/usePwa';
import { InstallModal } from './InstallModal';

interface InstallAppButtonProps {
  className?: string;
  style?: React.CSSProperties;
  showIconOnly?: boolean;
}

export function InstallAppButton({ className, style, showIconOnly = false }: InstallAppButtonProps) {
  const { isInstalled, canPromptInstall, promptInstall } = usePwa();
  const [modalOpen, setModalOpen] = useState(false);

  // If already installed in standalone mode, do not show install options
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (canPromptInstall) {
      const outcome = await promptInstall();
      if (outcome === 'manual') {
        setModalOpen(true);
      }
    } else {
      setModalOpen(true);
    }
  };

  const buttonClasses = ['install-app-btn', className].filter(Boolean).join(' ');

  return (
    <>
      <button
        type="button"
        className={buttonClasses}
        onClick={() => void handleClick()}
        style={style}
        title="Install VIT Community Radio App"
        aria-label="Install VIT Community Radio App"
      >
        <svg
          className="install-app-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {!showIconOnly && <span className="install-app-label">Install App</span>}
      </button>

      <InstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
