import {t as uiText} from './i18n';
import {setIconStyle} from './icon-preference';
import {syncNativeTheme} from './native-appearance';
import {useEffect} from 'react';
import {appearanceToolbarIconSize,appearanceFont,appearanceIcons,appearanceMode,appearancePalette,type PaletteId,type FontId,type IconStyleId} from '@pvta/shared';

export function useAppearance(preferences?:{palette?:PaletteId;fontSize:number;fontFamily?:FontId;iconStyle?:IconStyleId;toolbarIconSize?:number}){
 useEffect(()=>{
  if(!preferences)return;
  const root=document.documentElement,media=window.matchMedia('(prefers-color-scheme: dark)');
  const apply=()=>{
   const palette=appearancePalette(preferences.palette),mode=appearanceMode(palette.id,media.matches);
   root.dataset.theme=mode;
   root.dataset.palette=palette.id;
   root.style.colorScheme=mode;
   root.style.setProperty('--ui-font',appearanceFont(preferences.fontFamily).family);
   root.style.fontFamily='var(--ui-font)';
   root.style.setProperty('--composer-icon-size',appearanceToolbarIconSize(preferences.toolbarIconSize)+'px');
   root.style.setProperty('--ui-icon-scale',String(appearanceToolbarIconSize(preferences.toolbarIconSize)/16));
   root.style.setProperty('--composer-button-size',(appearanceToolbarIconSize(preferences.toolbarIconSize)+14)+'px');
   root.dataset.iconStyle=appearanceIcons(preferences.iconStyle);
   setIconStyle(preferences.iconStyle);
   void syncNativeTheme(palette.mode??null).catch(error=>console.error(uiText("Không đổi được giao diện thanh tiêu đề:"),error));
   for(const [key,value] of Object.entries(palette[mode]))root.style.setProperty('--'+key,value);
   root.style.setProperty('--chat-size',preferences.fontSize+'px');
  };
  apply();media.addEventListener('change',apply);
  return()=>media.removeEventListener('change',apply);
 },[preferences?.palette,preferences?.fontSize,preferences?.fontFamily,preferences?.iconStyle,preferences?.toolbarIconSize]);
}
