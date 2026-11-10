import React from 'react';
import type { VisitorState } from '../types/expo';
import { AvatarCharacter } from './LocalPlayer';

export interface RemotePlayersProps {
  visitors: VisitorState[];
  boothNamesById: Map<string, string>;
  remoteVisitorsLiveRef?: React.MutableRefObject<Map<string, VisitorState>>;
}

export const RemotePlayers: React.FC<RemotePlayersProps> = React.memo(
  ({ visitors, boothNamesById, remoteVisitorsLiveRef }) => {
    return (
      <group>
        {visitors.map((visitor) => (
          <AvatarCharacter
            key={visitor.sessionId}
            name={visitor.name}
            color={visitor.color}
            position={[visitor.x, 0, visitor.z]}
            rotationY={visitor.rotationY}
            state={visitor.state}
            activeBoothName={
              visitor.activeBoothId ? boothNamesById.get(visitor.activeBoothId) ?? null : null
            }
            liveTransform={
              remoteVisitorsLiveRef
                ? () => remoteVisitorsLiveRef.current.get(visitor.sessionId)
                : undefined
            }
          />
        ))}
      </group>
    );
  }
);
