/**
 * src/components/DashboardAIChatBox.tsx
 * Boîte de consultation et d'assistance juridique sur le Tableau de bord.
 * Connectée à l'API Assistant IA + RAG textes de lois.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Scale, Send, Search, ExternalLink, RefreshCw, CheckCircle2, ChevronRight } from 'lucide-react-native';
import { AppColors as C } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import api, { extractErrorMessage } from '@/lib/api';
import { useRouter } from 'expo-router';

const PRESET_PROMPTS = [
  'Licenciement abusif',
  'Procédure de référé',
  'Preuve contractuelle',
  'Délais de prescription',
];

export function DashboardAIChatBox() {
  const router = useRouter();
  const { colors: K, isDark } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const handleSend = async (questionText?: string) => {
    const textToSend = (questionText || prompt).trim();
    if (!textToSend) return;

    Keyboard.dismiss();
    setLoading(true);
    setLastQuestion(textToSend);
    if (!questionText) setPrompt('');

    try {
      const { data } = await api.post('/assistant-ia/chat', { prompt: textToSend });
      setResponse(data?.reponse || 'Aucune réponse générée.');
    } catch (err) {
      setResponse(`⚠️ ${extractErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: K.surface, borderColor: K.border }]}>
      {/* En-tête sobre & professionnel */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <View style={[styles.legalBadge, { backgroundColor: K.primaryLight }]}>
            <Scale color={K.primary} size={18} />
          </View>
          <View>
            <Text style={[styles.title, { color: K.text }]}>Consultation Juridique & Textes</Text>
            <Text style={[styles.subtitle, { color: K.textMuted }]}>Recherche de jurisprudence & textes de loi</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.expandBtn, { backgroundColor: K.bgSecondary, borderColor: K.border }]}
          onPress={() => router.push('/assistant-ia')}
          activeOpacity={0.8}
        >
          <Text style={[styles.expandText, { color: K.primary }]}>Ouvrir</Text>
          <ChevronRight color={K.primary} size={14} />
        </TouchableOpacity>
      </View>

      {/* Chips de suggestions rapides */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {PRESET_PROMPTS.map((p, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.chip, { backgroundColor: K.bgSecondary, borderColor: K.border }]}
            onPress={() => handleSend(p)}
            activeOpacity={0.8}
          >
            <Search color={K.primary} size={11} />
            <Text style={[styles.chipText, { color: K.textSecondary }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Zone de réponse */}
      {loading ? (
        <View style={[styles.loadingBox, { backgroundColor: K.bgSecondary }]}>
          <ActivityIndicator color={K.primary} size="small" />
          <Text style={[styles.loadingText, { color: K.primary }]}>Recherche dans les textes de lois en cours...</Text>
        </View>
      ) : response ? (
        <View style={[styles.responseBox, { backgroundColor: K.bgSecondary, borderColor: K.border }]}>
          <View style={[styles.responseHeader, { borderBottomColor: K.border }]}>
            <CheckCircle2 color={K.success} size={14} />
            <Text style={[styles.lastQuestionText, { color: K.textMuted }]} numberOfLines={1}>
              {lastQuestion}
            </Text>
            <TouchableOpacity onPress={() => setResponse(null)} style={styles.resetBtn}>
              <RefreshCw color={K.textMuted} size={12} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.responseScroll} nestedScrollEnabled>
            <Text style={[styles.responseText, { color: K.text }]}>{response}</Text>
          </ScrollView>
        </View>
      ) : null}

      {/* Champ de saisie & Bouton d'envoi */}
      <View style={[styles.inputWrap, { backgroundColor: K.inputBg, borderColor: K.inputBorder }]}>
        <TextInput
          style={[styles.input, { color: K.inputText }]}
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Poser une question juridique ou rechercher un article..."
          placeholderTextColor={K.inputPlaceholder}
          multiline={false}
          onSubmitEditing={() => handleSend()}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: K.primary }, (!prompt.trim() || loading) && styles.sendBtnDisabled]}
          onPress={() => handleSend()}
          disabled={!prompt.trim() || loading}
          activeOpacity={0.8}
        >
          <Send color={K.primaryText} size={15} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  legalBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  expandText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipsContainer: {
    gap: 6,
    paddingBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  loadingText: {
    fontSize: 12,
    flex: 1,
  },
  responseBox: {
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  lastQuestionText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  resetBtn: {
    padding: 2,
  },
  responseScroll: {
    maxHeight: 160,
  },
  responseText: {
    fontSize: 12,
    lineHeight: 18,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 3,
  },
  input: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});

