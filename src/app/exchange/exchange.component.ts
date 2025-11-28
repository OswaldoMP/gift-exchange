import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Participant } from '../models/participant-entity';
import { Gift } from '../models/Gift';
import { ParticipantServiceService } from '../services/participant-service.service';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../services/supabase-service.service';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';

@Component({
  selector: 'app-exchange',
  standalone: true,
  imports: [CommonModule, FormsModule],
  // templateUrl: './exchange.component.html',
  templateUrl: './exchange.component.html',
  styleUrl: './exchange.component.css'
})
export class ExchangeComponent implements OnInit {

  private router = inject(Router);

  currentUser!: Participant;
  participants: Participant[] = [];
  drawResult: any = false;


  expandedUserId: string | null = null;
  selectedGift: Gift | null = null;
  newGift: Gift | null = null;
  userEmail: string = "";
  assignedFriend: any = "";

  dateEvent = signal<string>("");
  timeEvent = signal<string>("");
  moneyEvent = signal<string>("");
  startEvent = signal<string>("");
  uploadGift = signal<string>("");

  constructor(
    public participantService: ParticipantServiceService,
    public supabaseService: SupabaseService,
    public route: ActivatedRoute
  ) {
    supabaseService.getParticipant(localStorage.getItem("uuid") as string).then(res => {
      this.currentUser = res;
      this.drawResult = this.currentUser.is_ready;
      this.assignedFriend = this.currentUser.friend_id;
    });
    supabaseService.getParticipants(localStorage.getItem("uuid") as string).then(res => {
      this.participants = res;
    });
  }

  ngOnInit(): void {
    this.route.snapshot.queryParamMap.get('email');
    this.getInfoEvent();
  }

  // Computed
  get isDrawn() {
    return this.drawResult;
    // return this.drawResult === false;
  }


  get myAssignedFriend(): Participant | null {
    if (!this.isDrawn) return null;

    return this.participants.find(p => p.id === this.assignedFriend) || null;
  }

  get canAddGift(): boolean {
    return this.currentUser.gifts.length < 5;
  }


  // UI actions
  toggleUserExpand(userId: string) {
    this.expandedUserId = this.expandedUserId === userId ? null : userId;
  }


  openGift(gift: Gift) {
    this.selectedGift = gift;
    // prevent background scroll if wanted
    document.body.style.overflow = 'hidden';
  }

  openDialogNewGift() {
    this.newGift = {
      id: "",
      title: "",
      store: "",
      link: ""
    }
    document.body.style.overflow = 'hidden';
  }


  closeGift() {
    this.selectedGift = null;
    this.newGift = null;
    document.body.style.overflow = '';

    // Refresh
    this.supabaseService.getParticipant(localStorage.getItem("uuid") as string).then(res => {
      this.currentUser = res;
    });
  }


  // Placeholder: función para disparar el sorteo (probablemente en el backend)
  async requestDraw() {
    // emit event o llamada a servicio; aquí solo un ejemplo de cómo se podría indicar
    console.log('Solicitar sorteo al backend...');
    await this.supabaseService.updatedParticipantToReady(localStorage.getItem("uuid") as string, true);
    this.drawResult = true;
  }

  addGift(gift: Gift) {
    console.log("current user => ", this.currentUser)
    this.supabaseService.saveGift(gift, this.currentUser.id as string)
    this.closeGift();
  }

  removeGift(gift: Gift) {
    this.supabaseService.updateGift(gift, 1);
    this.closeGift();
  }

  updateGift(gift: Gift) {
    this.supabaseService.updateGift(gift, 0);
    this.closeGift();
  }


  addParticiapant() {
    const participant: Participant = {
      name: "Adrian Oswaldo",
      gifts: []
    }
    this.supabaseService.saveParticipant(participant).then(() => {
      console.log("SAVED!");
    }).catch(err => {
      console.log("FAILED!")
    });
  }

  async signOut() {
    const { error } = await this.supabaseService.signOut();
    if (error) {
      console.error("Error signing out:", error.message);
    } else {
      console.log("User successfully signed out.");
      // Optionally, redirect the user to a login page or home page
      localStorage.clear();
      this.router.navigate(['/login']);
    }
  }

  getInfoEvent() {
    const event = JSON.parse(localStorage.getItem("event") as string);

    this.dateEvent.set(event.date_event);
    this.timeEvent.set(event.time_event);
    this.moneyEvent.set(event.money_event);
    this.startEvent.set(event.start_event);
    this.uploadGift.set(event.upload_gift);
  }
  // TODO
  // Crear una funcion que haga una animacion de ruleta para asignar el amigo secreto. Esta funcion se ejecutara por un boton

}



