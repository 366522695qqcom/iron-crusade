import { useGame } from '../store/game_store';
import { Button } from './ui/Button';

export function LoginOverlay() {
  const { dispatch } = useGame();

  const handleStartGame = () => {
    dispatch({ type: 'START_GAME' });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 5, 15, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          textAlign: 'center',
          maxWidth: '600px',
          padding: '48px',
        }}
      >
        <div
          style={{
            fontSize: '72px',
            fontWeight: 'bold',
            color: '#d4a84b',
            textShadow: '0 0 20px rgba(212, 168, 75, 0.5), 0 4px 8px rgba(0,0,0,0.8)',
            marginBottom: '16px',
            letterSpacing: '4px',
          }}
        >
          HOI4 Mini
        </div>

        <div
          style={{
            fontSize: '24px',
            color: '#a0a0c0',
            marginBottom: '8px',
            fontWeight: 300,
          }}
        >
          钢铁雄心迷你版
        </div>

        <div
          style={{
            width: '120px',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #d4a84b, transparent)',
            margin: '24px auto',
          }}
        />

        <p
          style={{
            fontSize: '16px',
            color: '#707090',
            lineHeight: 1.8,
            marginBottom: '48px',
          }}
        >
          欢迎来到架空世界的战场！
          <br />
          指挥你的军队，建设你的国家，在这片大陆上书写属于你的历史。
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center',
          }}
        >
          <Button
            variant="primary"
            size="large"
            onClick={handleStartGame}
            style={{
              fontSize: '20px',
              padding: '16px 48px',
              minWidth: '200px',
              fontWeight: 600,
              letterSpacing: '2px',
              boxShadow: '0 0 20px rgba(212, 168, 75, 0.3)',
            }}
          >
            ⚔️ 开始游戏
          </Button>

          <div
            style={{
              fontSize: '12px',
              color: '#505070',
              marginTop: '16px',
            }}
          >
            提示：滚轮缩放地图，拖拽平移，点击省份查看详情
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          fontSize: '12px',
          color: '#404060',
        }}
      >
        v1.0.0 - Web Version
      </div>
    </div>
  );
}
