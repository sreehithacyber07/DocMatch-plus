export interface TimelineEntry {
  kind: 'routing' | 'safety' | 'intake';
  questionId: string;
  text: string;
  label: string;
  answeredAt: string;
  changeable: boolean;
}
