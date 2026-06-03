import { useState, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Card, Badge } from '@/components/ui';
import { Search as SearchIcon, ArrowLeft, Building2, User, Award, ChevronRight } from 'lucide-react-native';

interface SearchResult {
  id: string;
  type: 'member' | 'firm' | 'certificate';
  title: string;
  subtitle: string;
  status: string;
  search_rank: number;
  deep_link: string;
}

const rankLabels = (rank: number): string => {
  if (rank >= 100) return 'Exact ID Match';
  if (rank >= 90) return 'Exact Certificate Match';
  if (rank >= 80) return 'Exact Email Match';
  if (rank >= 70) return 'Exact Phone Match';
  if (rank >= 60) return 'Exact License Match';
  if (rank >= 50) return 'Exact GSTIN Match';
  return 'Fuzzy Match';
};

export default function AdminSearchScreen() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeSearch = async (text: string) => {
    if (!text.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('global_admin_search', {
        p_query: text.trim()
      });

      if (error) throw error;
      setResults((data || []) as SearchResult[]);
      setSearched(true);
    } catch (err) {
      console.error('Global search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => executeSearch(text), 400);
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Search Header */}
      <View className="bg-primary-900 px-4 pb-4 pt-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View className="flex-1 flex-row items-center rounded-lg bg-white/10 px-3 py-1 border border-white/20">
          <SearchIcon size={18} color="#86efac" />
          <TextInput
            className="ml-2 flex-1 py-1.5 text-base text-white"
            placeholder="Search membership, email, phone, certificates..."
            placeholderTextColor="#86efac"
            autoFocus
            value={query}
            onChangeText={handleSearch}
          />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-12">
        {loading && (
          <View className="py-12 items-center justify-center">
            <ActivityIndicator size="large" color="#15803d" />
            <Text className="mt-3 text-sm text-gray-500 font-medium">Scanning registries...</Text>
          </View>
        )}

        {!loading && results.length > 0 && (
          <View className="gap-2">
            <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Found {results.length} Matches (Rank Ordered)
            </Text>

            {results.map((res) => {
              const rankLabel = rankLabels(res.search_rank);
              const isExact = res.search_rank >= 50;

              return (
                <TouchableOpacity
                  key={res.id}
                  onPress={() => router.replace(res.deep_link as any)}
                >
                  <Card className="border border-gray-100 hover:border-gray-200">
                    <View className="flex-row items-center gap-3">
                      <View className={`p-2 rounded-lg ${
                        res.type === 'member' ? 'bg-primary-50' : res.type === 'firm' ? 'bg-indigo-50' : 'bg-green-50'
                      }`}>
                        {res.type === 'member' && <User size={18} color="#15803d" />}
                        {res.type === 'firm' && <Building2 size={18} color="#4f46e5" />}
                        {res.type === 'certificate' && <Award size={18} color="#16a34a" />}
                      </View>
                      
                      <View className="flex-1">
                        <View className="flex-row items-center flex-wrap gap-1 mb-0.5">
                          <Text className="text-sm font-bold text-gray-900 leading-tight mr-1">
                            {res.title}
                          </Text>
                          <Badge 
                            label={rankLabel} 
                            variant={isExact ? 'success' : 'default'} 
                          />
                        </View>
                        <Text className="text-xs text-gray-500">{res.subtitle}</Text>
                      </View>

                      <View className="flex-row items-center gap-1">
                        <Text className="text-[10px] uppercase font-bold text-gray-400">{res.status}</Text>
                        <ChevronRight size={14} color="#9ca3af" />
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!loading && searched && results.length === 0 && (
          <View className="py-16 items-center justify-center p-4">
            <Text className="text-gray-500 font-medium text-center">No matching records found.</Text>
            <Text className="text-gray-400 text-xs text-center mt-1">Try entering another registry ID, license number, or phone number.</Text>
          </View>
        )}

        {!searched && !loading && (
          <View className="py-16 items-center justify-center p-4">
            <SearchIcon size={40} color="#9ca3af" />
            <Text className="text-gray-400 text-sm mt-3 text-center">Enter query keywords to perform global audit indexing.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
