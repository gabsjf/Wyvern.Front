import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlaySession } from './play-session';

describe('PlaySession', () => {
  let component: PlaySession;
  let fixture: ComponentFixture<PlaySession>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaySession],
    }).compileComponents();

    fixture = TestBed.createComponent(PlaySession);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
