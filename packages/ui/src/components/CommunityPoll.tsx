import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface PollOption {
  id: string;
  label: string;
}

interface CommunityPollProps {
  question: string;
  options: PollOption[];
  onVote: (optionId: string) => Promise<void>;
}

export function CommunityPoll({ question, options, onVote }: CommunityPollProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVote = async (id: string) => {
    setIsSubmitting(true);
    setSelectedId(id);
    await onVote(id);
    setIsSubmitting(false);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.question}>{question}</Text>
      <View style={styles.optionsContainer}>
        {options.map((option) => {
          const isSelected = selectedId === option.id;
          return (
            <Pressable
              key={option.id}
              style={[styles.optionButton, isSelected && styles.selectedButton]}
              onPress={() => handleVote(option.id)}
              disabled={isSubmitting || selectedId !== null}
            >
              <Text style={[styles.optionText, isSelected && styles.selectedText]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, backgroundColor: '#1E1E1E', borderRadius: 12, margin: 16 },
  question: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 16 },
  optionsContainer: { gap: 12 },
  optionButton: { padding: 16, backgroundColor: '#2D2D2D', borderRadius: 8, borderWidth: 1, borderColor: '#3D3D3D' },
  selectedButton: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  optionText: { color: '#E5E7EB', fontSize: 16, textAlign: 'center' },
  selectedText: { color: '#FFFFFF', fontWeight: 'bold' },
});
