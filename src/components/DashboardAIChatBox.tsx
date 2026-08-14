/**
 * src/components/DashboardAIChatBox.tsx
 * Boîte de dialogue intéractive avec l'Assistant IA directement sur le Tableau de bord.
 * Connectée en direct à l'API Google Gemini + RAG (7 156 textes de lois).
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
import { Brain, Send, Sparkles, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react-native';
import { AppColors as C } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import api, { extractErrorMessage } from '@/lib/api';
import { useRouter } from 'expo-router';

const PRESET_PROMPTS = [
  'Licenciement abusif au Cameroun',
  'Procédure de référé',
  'Audiences du jour',
  'Règles de la preuve contractuelle',
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
      {/* En-tête de la boîte IA */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <View style={[styles.aiBadge, { backgroundColor: K.primaryLight }]}>
            <Brain color={K.primary} size={18} />
          </View>
          <View>
            <Text style={[styles.title, { color: K.text }]}>Assistant IA Juridique</Text>
            <Text style={[styles.subtitle, { color: K.textMuted }]}>En ligne (Google Gemini + 7 156 Lois)</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.expandBtn, { backgroundColor: K.bgTertiary }]}
          onPress={() => router.push('/assistant-ia')}
          activeOpacity={0.8}
        >
          <Text style={[styles.expandText, { color: K.primary }]}>Plein écran</Text>
          <ExternalLink color={K.primary} size={14} />
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
            style={[styles.chip, { backgroundColor: K.bgTertiary, borderColor: K.border }]}
            onPress={() => handleSend(p)}
            activeOpacity={0.8}
          >
            <Sparkles color={K.primary} size={12} />
            <Text style={[styles.chipText, { color: K.textSecondary }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Zone de réponse de l'IA */}
      {loading ? (
        <View style={[styles.loadingBox, { backgroundColor: K.bgSecondary }]}>
          <ActivityIndicator color={K.primary} size="small" />
          <Text style={[styles.loadingText, { color: K.primary }]}>Consultation de Google Gemini & des textes de lois...</Text>
        </View>
      ) : response ? (
        <View style={[styles.responseBox, { backgroundColor: K.bgSecondary, borderColor: K.border }]}>
          <View style={[styles.responseHeader, { borderBottomColor: K.border }]}>
            <CheckCircle2 color={K.success} size={14} />
            <Text style={[styles.lastQuestionText, { color: K.textMuted }]} numberOfLines={1}>
              Q: "{lastQuestion}"
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
      <View style={[styles.inputWrap, { backgroundColor: K.inputBg, borderColor: K.border }]}>
        <TextInput
          style={[styles.input, { color: K.inputText }]}
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Posez une question juridique au cabinet..."
          placeholderTextColor={K.textMuted}
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
          <Send color={isDark ? C.gray900 : '#ffffff'} size={16} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.navy900,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    marginVertical: 12,
    shadowColor: C.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245,158,11,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: C.white,
  },
  subtitle: {
    fontSize: 11,
    color: C.amber400,
    marginTop: 1,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  expandText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.amber400,
  },
  chipsContainer: {
    gap: 8,
    paddingBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 11,
    color: C.gray200,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 12,
    color: C.amber400,
    flex: 1,
  },
  responseBox: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  lastQuestionText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.gray400,
    flex: 1,
  },
  resetBtn: {
    padding: 2,
  },
  responseScroll: {
    maxHeight: 180,
  },
  responseText: {
    fontSize: 13,
    lineHeight: 19,
    color: C.gray200,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.gray900,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.gray700,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: C.white,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.amber500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
