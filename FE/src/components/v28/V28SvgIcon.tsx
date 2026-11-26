import React from 'react';
import audioOnUrl from '../../assets/icons/v28/audio-on.svg';
import audioOffUrl from '../../assets/icons/v28/audio-off.svg';
import boltUrl from '../../assets/icons/v28/bolt.svg';
import cameraUrl from '../../assets/icons/v28/camera.svg';
import chatUrl from '../../assets/icons/v28/chat.svg';
import closeUrl from '../../assets/icons/v28/close.svg';
import compassUrl from '../../assets/icons/v28/compass.svg';
import editUrl from '../../assets/icons/v28/edit.svg';
import gamepadUrl from '../../assets/icons/v28/gamepad.svg';
import giftUrl from '../../assets/icons/v28/gift.svg';
import globeUrl from '../../assets/icons/v28/globe.svg';
import heartUrl from '../../assets/icons/v28/heart.svg';
import heartFilledUrl from '../../assets/icons/v28/heart-filled.svg';
import joystickUrl from '../../assets/icons/v28/joystick.svg';
import mapUrl from '../../assets/icons/v28/map.svg';
import menuUrl from '../../assets/icons/v28/menu.svg';
import walkUrl from '../../assets/icons/v28/walk.svg';
import dashboardUrl from '../../assets/icons/v28/dashboard.svg';
import sparklesUrl from '../../assets/icons/v28/sparkles.svg';
import logoutUrl from '../../assets/icons/v28/logout.svg';
import warningUrl from '../../assets/icons/v28/warning.svg';
import checkUrl from '../../assets/icons/v28/check.svg';
import searchUrl from '../../assets/icons/v28/search.svg';
import pinUrl from '../../assets/icons/v28/pin.svg';
import boxUrl from '../../assets/icons/v28/box.svg';
import buildingUrl from '../../assets/icons/v28/building.svg';
import trashUrl from '../../assets/icons/v28/trash.svg';

export type V28IconName =
  | 'audio-on'
  | 'audio-off'
  | 'bolt'
  | 'box'
  | 'building'
  | 'camera'
  | 'chat'
  | 'check'
  | 'close'
  | 'compass'
  | 'dashboard'
  | 'edit'
  | 'gamepad'
  | 'gift'
  | 'globe'
  | 'heart'
  | 'heart-filled'
  | 'joystick'
  | 'logout'
  | 'map'
  | 'menu'
  | 'pin'
  | 'search'
  | 'sparkles'
  | 'trash'
  | 'walk'
  | 'warning';

export const V28_ICON_ASSET_URLS: Record<V28IconName, string> = {
  'audio-on': audioOnUrl,
  'audio-off': audioOffUrl,
  bolt: boltUrl,
  box: boxUrl,
  building: buildingUrl,
  camera: cameraUrl,
  chat: chatUrl,
  check: checkUrl,
  close: closeUrl,
  compass: compassUrl,
  dashboard: dashboardUrl,
  edit: editUrl,
  gamepad: gamepadUrl,
  gift: giftUrl,
  globe: globeUrl,
  heart: heartUrl,
  'heart-filled': heartFilledUrl,
  joystick: joystickUrl,
  logout: logoutUrl,
  map: mapUrl,
  menu: menuUrl,
  pin: pinUrl,
  search: searchUrl,
  sparkles: sparklesUrl,
  trash: trashUrl,
  walk: walkUrl,
  warning: warningUrl,
};

export interface V28SvgIconProps {
  name: V28IconName;
  size?: number;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a real static `.svg` asset file from `FE/src/assets/icons/v28/`
 * using CSS mask-image so the icon automatically inherits `currentColor`
 * across hover, active, and dark/light HUD states with zero inline HTML injection.
 */
export const V28SvgIcon: React.FC<V28SvgIconProps> = ({
  name,
  size = 16,
  label,
  className,
  style,
}) => {
  const url = V28_ICON_ASSET_URLS[name];
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-icon={name}
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        backgroundColor: 'currentColor',
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        verticalAlign: 'middle',
        ...style,
      }}
    />
  );
};
