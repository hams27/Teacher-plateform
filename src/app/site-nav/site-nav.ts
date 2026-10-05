import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavUser } from '../nav-user/nav-user';

@Component({
  selector: 'app-site-nav',
  standalone: true,
  imports: [RouterLink, NavUser],
  templateUrl: './site-nav.html',
  styleUrl: './site-nav.scss'
})
export class SiteNav {}
