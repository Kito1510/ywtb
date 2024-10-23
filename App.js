import React, { useState, useEffect } from 'react';
import { Search, Server, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const INVIDIOUS_INSTANCES = [
  "https://iv.datura.network",
  "https://invidious.private.coffee",
  "https://invidious.protokolla.fi",
  "https://invidious.perennialte.ch",
  "https://yt.cdaut.de",
  "https://invidious.materialio.us",
  "https://yewtu.be",
  "https://invidious.fdn.fr",
  "https://inv.tux.pizza",
  "https://invidious.privacyredirect.com",
  "https://invidious.drgns.space",
  "https://vid.puffyan.us",
  "https://invidious.jing.rocks",
  "https://youtube.076.ne.jp",
  "https://inv.riverside.rocks",
  "https://invidio.xamh.de",
  "https://y.com.sb",
  "https://invidious.sethforprivacy.com",
  "https://invidious.tiekoetter.com",
  "https://inv.bp.projectsegfau.lt",
  "https://inv.vern.cc",
  "https://invidious.nerdvpn.de",
  "https://inv.privacy.com.de",
  "https://invidious.rhyshl.live",
  "https://invidious.slipfox.xyz",
  "https://invidious.weblibre.org",
  "https://invidious.namazso.eu"
].filter((value, index, self) => self.indexOf(value) === index); // 重複を削除

const VideoViewer = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableInstances, setAvailableInstances] = useState([]);
  const [activeInstance, setActiveInstance] = useState('');
  const [checkingServers, setCheckingServers] = useState(true);
  const [checkProgress, setCheckProgress] = useState(0);
  const [lastChecked, setLastChecked] = useState(null);

  // サーバーの応答時間を測定する関数
  const measureServerResponse = async (instanceUrl) => {
    const startTime = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${instanceUrl}/api/v1/stats`, {
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      const endTime = performance.now();
      return response.ok ? endTime - startTime : null;
    } catch {
      return null;
    }
  };

  // 利用可能なサーバーを見つける
  const findAvailableServers = async () => {
    setCheckingServers(true);
    setCheckProgress(0);
    
    const servers = [];
    const chunkSize = 5; // 同時に確認するサーバーの数

    for (let i = 0; i < INVIDIOUS_INSTANCES.length; i += chunkSize) {
      const chunk = INVIDIOUS_INSTANCES.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (instance) => {
          const responseTime = await measureServerResponse(instance);
          return responseTime ? { url: instance, responseTime } : null;
        })
      );
      
      servers.push(...results.filter(Boolean));
      setCheckProgress((i + chunkSize) / INVIDIOUS_INSTANCES.length * 100);
    }

    // 応答時間でソート
    const sortedServers = servers.sort((a, b) => a.responseTime - b.responseTime);
    setAvailableInstances(sortedServers);
    
    if (sortedServers.length > 0) {
      setActiveInstance(sortedServers[0].url);
    }
    
    setCheckingServers(false);
    setLastChecked(new Date());

    // ローカルストレージにキャッシュ
    localStorage.setItem('invidiousServers', JSON.stringify({
      servers: sortedServers,
      timestamp: Date.now()
    }));
  };

  // キャッシュされたサーバーリストを読み込む
  const loadCachedServers = () => {
    const cached = localStorage.getItem('invidiousServers');
    if (cached) {
      const { servers, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      // キャッシュが30分以内なら使用
      if (age < 30 * 60 * 1000) {
        setAvailableInstances(servers);
        setActiveInstance(servers[0].url);
        setCheckingServers(false);
        setLastChecked(new Date(timestamp));
        return true;
      }
    }
    return false;
  };

  // コンポーネントマウント時の処理
  useEffect(() => {
    const hasCachedServers = loadCachedServers();
    if (!hasCachedServers) {
      findAvailableServers();
    }
    
    // 30分ごとにサーバーの状態を再チェック
    const interval = setInterval(findAvailableServers, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const searchVideos = async () => {
    if (!searchQuery.trim() || !activeInstance) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${activeInstance}/api/v1/search?q=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            'Accept': 'application/json'
          },
          timeout: 8000
        }
      );
      
      if (!response.ok) {
        throw new Error('検索に失敗しました');
      }

      const data = await response.json();
      if (data && Array.isArray(data)) {
        setVideos(data);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Search failed:', err);
      setError('検索中にエラーが発生しました。別のサーバーを試してください。');
      // エラー時に自動的に次のサーバーに切り替え
      handleServerChange();
    } finally {
      setLoading(false);
    }
  };

  const handleServerChange = () => {
    const currentIndex = availableInstances.findIndex(s => s.url === activeInstance);
    const nextIndex = (currentIndex + 1) % availableInstances.length;
    setActiveInstance(availableInstances[nextIndex].url);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      searchVideos();
    }
  };

  if (checkingServers) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md">
          <Progress value={checkProgress} className="mb-4" />
          <p className="text-center text-gray-600">
            利用可能なサーバーを確認中... ({Math.round(checkProgress)}%)
          </p>
        </div>
      </div>
    );
  }

  if (availableInstances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>
            現在利用可能なサーバーが見つかりません。しばらく待ってから再度お試しください。
          </AlertDescription>
        </Alert>
        <Button onClick={findAvailableServers} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" />
          サーバーを再チェック
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">動画検索</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              <Server className="w-4 h-4 mr-1" />
              {activeInstance.replace('https://', '')}
              {' '}
              ({Math.round(availableInstances.find(s => s.url === activeInstance)?.responseTime)}ms)
            </Badge>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleServerChange}
              disabled={availableInstances.length <= 1}
            >
              次のサーバー
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={findAvailableServers}
              title="最終チェック: ${lastChecked?.toLocaleString()}"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="text-sm text-gray-500 mb-2">
          利用可能なサーバー: {availableInstances.length} / {INVIDIOUS_INSTANCES.length}
          {lastChecked && ` • 最終チェック: ${lastChecked.toLocaleString()}`}
        </div>
        
        <div className="flex gap-2 mb-4">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="検索キーワードを入力..."
            className="flex-1"
          />
          <Button 
            onClick={searchVideos}
            disabled={loading || !activeInstance}
            className="min-w-[100px]"
          >
            {loading ? (
              <span className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                検索中
              </span>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                検索
              </>
            )}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {videos.map((video) => (
          <Card key={video.videoId} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="aspect-video mb-2 overflow-hidden rounded">
                <img
                  src={`${activeInstance}/vi/${video.videoId}/medium.jpg`}
                  alt={video.title}
                  className="w-full h-full object-cover transform hover:scale-105 transition-transform"
                  onError={(e) => {
                    e.target.src = '/api/placeholder/320/180';
                  }}
                />
              </div>
              <h3 className="font-semibold mb-1 line-clamp-2">{video.title}</h3>
              <p className="text-sm text-gray-600 mb-1">{video.author}</p>
              <div className="flex items-center text-sm text-gray-500 gap-2">
                <span>{video.viewCount?.toLocaleString() || '0'} 回視聴</span>
                <span>•</span>
                <span>{formatDuration(video.lengthSeconds)}</span>
              </div>
              <div className="mt-2">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.open(`${activeInstance}/watch?v=${video.videoId}`, '_blank')}
                >
                  視聴する
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

const formatDuration = (seconds) => {
  if (!seconds) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

export default VideoViewer;
