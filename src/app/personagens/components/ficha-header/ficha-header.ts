import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ficha-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ficha-header.html',
  styleUrls: ['./ficha-header.scss']
})
export class FichaHeader {
  @Input() personagem: any;
}
