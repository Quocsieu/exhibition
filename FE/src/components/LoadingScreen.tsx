import React from 'react';

export interface LoadingScreenProps {
  loading: boolean;
  warningMessage?: string | null;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ loading, warningMessage }) => {
  if (loading) {
    return (
      <div className="expo-toast expo-toast--loading" role="status" aria-live="polite">
        ⏳ Đang tải khuôn viên triển lãm và gian hàng...
      </div>
    );
  }

  if (warningMessage) {
    return (
      <div className="expo-toast expo-toast--warning" role="status" aria-live="polite">
        ⚠️ {warningMessage}
      </div>
    );
  }

  return null;
};
