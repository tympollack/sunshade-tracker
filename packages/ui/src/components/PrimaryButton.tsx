import React from 'react';
import { Pressable, Text, ActivityIndicator, View, type ViewStyle, type TextStyle, type StyleProp } from 'react-native';
import { cn } from '../utils/cn';

export interface PrimaryButtonProps {
  children?: React.ReactNode;
  label?: string;
  onPress?: () => void | Promise<void>;
  onClick?: () => void;
  variant?: 'sunshade' | 'cozy' | 'outline' | 'glass' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const variantConfig = {
  sunshade: {
    container: 'bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white shadow-lg shadow-orange-900/20 border border-orange-500/30',
    text: 'text-white font-semibold',
    styleBg: '#CC5500',
    styleBorder: 'rgba(255, 255, 255, 0.15)',
    textColor: '#FFFFFF',
    spinnerColor: '#FFFFFF',
  },
  cozy: {
    container: 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white shadow-lg shadow-amber-950/30 border border-amber-400/30',
    text: 'text-white font-semibold',
    styleBg: '#D97706',
    styleBorder: 'rgba(245, 158, 11, 0.40)',
    textColor: '#FFFFFF',
    spinnerColor: '#FFFFFF',
  },
  outline: {
    container: 'bg-transparent border border-orange-500/50 hover:bg-orange-500/10 text-orange-400',
    text: 'text-orange-400 font-semibold',
    styleBg: 'transparent',
    styleBorder: '#CC5500',
    textColor: '#CC5500',
    spinnerColor: '#CC5500',
  },
  glass: {
    container: 'backdrop-blur-md bg-stone-950/85 border border-white/10 hover:border-orange-500/30 text-white shadow-xl',
    text: 'text-white font-semibold',
    styleBg: 'rgba(12, 10, 9, 0.85)',
    styleBorder: 'rgba(255, 255, 255, 0.10)',
    textColor: '#FFFFFF',
    spinnerColor: '#FFFFFF',
  },
  ghost: {
    container: 'bg-transparent hover:bg-white/5 text-zinc-300 hover:text-white',
    text: 'text-zinc-300 font-medium',
    styleBg: 'transparent',
    styleBorder: 'transparent',
    textColor: '#d4d4d8',
    spinnerColor: '#d4d4d8',
  },
};

const sizeConfig = {
  sm: {
    container: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
    text: 'text-xs',
    nativePaddingH: 12,
    nativePaddingV: 6,
    borderRadius: 8,
    fontSize: 12,
  },
  md: {
    container: 'px-4 py-2.5 text-sm gap-2 rounded-xl',
    text: 'text-sm',
    nativePaddingH: 16,
    nativePaddingV: 10,
    borderRadius: 12,
    fontSize: 14,
  },
  lg: {
    container: 'px-6 py-3.5 text-base gap-2.5 rounded-2xl',
    text: 'text-base',
    nativePaddingH: 24,
    nativePaddingV: 14,
    borderRadius: 16,
    fontSize: 16,
  },
};

/**
 * PrimaryButton - Shared cross-platform action button primitive.
 */
export function PrimaryButton({
  children,
  label,
  onPress,
  onClick,
  variant = 'sunshade',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  className,
  style,
  textStyle,
}: PrimaryButtonProps) {
  const v = variantConfig[variant] || variantConfig.sunshade;
  const s = sizeConfig[size] || sizeConfig.md;
  const isDisabled = disabled || isLoading;

  const handlePress = () => {
    if (isDisabled) return;
    if (onPress) {
      onPress();
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      // @ts-ignore className support in NativeWind/Solito/React Native Web
      className={cn(
        'inline-flex flex-row items-center justify-center transition-all duration-200 cursor-pointer select-none',
        v.container,
        s.container,
        isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className
      )}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: v.styleBg,
          borderColor: v.styleBorder,
          borderWidth: 1,
          borderRadius: s.borderRadius,
          paddingHorizontal: s.nativePaddingH,
          paddingVertical: s.nativePaddingV,
          opacity: isDisabled ? 0.5 : 1,
        },
        style as ViewStyle,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={v.spinnerColor} style={{ marginRight: 8 }} />
      ) : icon && iconPosition === 'left' ? (
        <View style={{ marginRight: 8 }}>{icon}</View>
      ) : null}

      {children ? (
        typeof children === 'string' ? (
          <Text
            // @ts-ignore className support
            className={cn('font-sans', v.text, s.text)}
            style={[
              {
                color: v.textColor,
                fontSize: s.fontSize,
                fontWeight: '600',
              },
              textStyle,
            ]}
          >
            {children}
          </Text>
        ) : (
          children
        )
      ) : label ? (
        <Text
          // @ts-ignore className support
          className={cn('font-sans', v.text, s.text)}
          style={[
            {
              color: v.textColor,
              fontSize: s.fontSize,
              fontWeight: '600',
            },
            textStyle,
          ]}
        >
          {label}
        </Text>
      ) : null}

      {!isLoading && icon && iconPosition === 'right' && (
        <View style={{ marginLeft: 8 }}>{icon}</View>
      )}
    </Pressable>
  );
}

export default PrimaryButton;
