import { Component } from './Component';

export class MissingComponent extends Component {
  readonly originalType: string;
  readonly rawProps: Record<string, unknown>;

  constructor(originalType: string, rawProps: Record<string, unknown>) {
    super();
    this.originalType = originalType;
    this.rawProps = rawProps;
  }
}
