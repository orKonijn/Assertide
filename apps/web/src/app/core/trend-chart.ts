import {
  Component,
  ElementRef,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { init, use, type EChartsType } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);
@Component({
  selector: 'app-trend-chart',
  styles: [':host { display: block; min-width: 0; overflow: hidden; }'],
  template:
    '<div #chart role="img" aria-label="Daily final pass rate. Exact values are in the table below." style="height:260px;width:100%"></div>',
})
export class TrendChart {
  readonly points = input.required<{ day: string; finalPassRate: number | null }[]>();
  private readonly element = viewChild<ElementRef<HTMLDivElement>>('chart');
  private chart?: EChartsType;
  constructor() {
    const destroy = inject(DestroyRef);
    effect(() => {
      this.points();
      this.draw();
    });
    afterNextRender(() => {
      const node = this.element()?.nativeElement;
      if (!node) return;
      this.chart = init(node, undefined, { renderer: 'svg' });
      const resize = new ResizeObserver(() => this.chart?.resize());
      resize.observe(node);
      const theme = new MutationObserver(() => this.draw());
      theme.observe(document.documentElement, { attributes: true });
      this.draw();
      destroy.onDestroy(() => {
        resize.disconnect();
        theme.disconnect();
        this.chart?.dispose();
      });
    });
  }
  private draw() {
    const color =
      getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#64748b';
    this.chart?.setOption({
      animation: false,
      grid: { left: 48, right: 20, top: 20, bottom: 35 },
      tooltip: { trigger: 'axis', valueFormatter: (value: number | string) => `${value}%` },
      xAxis: {
        type: 'category',
        data: this.points().map((point) => point.day),
        axisLabel: { color },
        axisLine: { lineStyle: { color } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { formatter: '{value}%', color },
        splitLine: { lineStyle: { color: '#94a3b833' } },
      },
      series: [
        {
          type: 'line',
          name: 'Final pass rate',
          data: this.points().map((point) =>
            point.finalPassRate === null ? null : Math.round(point.finalPassRate * 1000) / 10,
          ),
          connectNulls: false,
          symbolSize: 8,
          lineStyle: { color: '#8b7cf8', width: 3 },
          itemStyle: { color: '#8b7cf8' },
        },
      ],
    });
  }
}
