import {Composition} from 'remotion';
import {DictivoDemo, FPS, HEIGHT, TOTAL_FRAMES, WIDTH} from './DictivoDemo';

export const RemotionRoot = () => {
  return (
    <Composition
      id="DictivoDemo"
      component={DictivoDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
