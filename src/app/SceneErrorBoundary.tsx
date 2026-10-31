import { Component, type ReactNode } from 'react';
import { SceneMessage } from '@/components/ui/SceneMessage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <SceneMessage title="The observatory is unavailable.">
          The 3D renderer could not start. Try reloading with hardware acceleration enabled in a
          browser that supports WebGL 2.
        </SceneMessage>
      );
    }

    return this.props.children;
  }
}
