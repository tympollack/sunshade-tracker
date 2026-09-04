import React from 'react';
import { View, Pressable, type ViewProps, type ViewStyle, type StyleProp } from 'react-native';
import { glassPresets, glassStyles } from '../tokens/glass';
import { cn } from '../utils/cn';

export interface GlassCardProps extends ViewProps {
  children?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'cozy' | 'subtle' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8',
};

/**
 * GlassCard - Shared cross-platform glassmorphic container primitive.
 * Standard preset: backdrop-blur-md bg-stone-950/85 border border-white/10 shadow-xl rounded-2xl
 */
export function GlassCard({
  children,
  className,
  variant = 'default',
  padding = 'md',
  onPress,
  style,
  ...rest
}: GlassCardProps) {
  const variantClass = glassPresets[variant] || glassPresets.standard;
  const combinedClassName = cn(variantClass, paddingClasses[padding], className);
  const fallbackStyle = glassStyles[variant === 'cozy' ? 'cozy' : variant === 'subtle' ? 'subtle' : 'standard'];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        // @ts-ignore className support in NativeWind/Solito/React Native Web
        className={combinedClassName}
        style={[fallbackStyle as ViewStyle, style as ViewStyle]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      // @ts-ignore className support in NativeWind/Solito/React Native Web
      className={combinedClassName}
      style={[fallbackStyle as ViewStyle, style as ViewStyle]}
      {...rest}
    >
      {children}
    </View>
  );
}

export default GlassCard;
