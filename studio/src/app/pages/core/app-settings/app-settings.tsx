import {Component, Listen, State, h, Element} from '@stencil/core';
import {OverlayEventDetail} from '@ionic/core';
import {filter, take} from 'rxjs/operators';

import firebase from '@firebase/app';
import '@firebase/auth';

import {ApiUser} from '../../../models/api/api.user';
import {AuthUser} from '../../../models/auth/auth.user';
import {User} from '../../../models/data/user';

import {UserUtils} from '../../../utils/core/user-utils';
import {IonControllerUtils} from '../../../utils/core/ion-controller-utils';

import {ApiUserService} from '../../../services/api/user/api.user.service';
import {AuthService} from '../../../services/auth/auth.service';
import {NavDirection, NavService} from '../../../services/core/nav/nav.service';
import {ErrorService} from '../../../services/core/error/error.service';
import {ImageHistoryService} from '../../../services/editor/image-history/image-history.service';
import {UserService} from '../../../services/data/user/user.service';
import {StorageService} from '../../../services/storage/storage.service';
import {ApiUserFactoryService} from '../../../services/api/user/api.user.factory.service';

@Component({
    tag: 'app-settings',
    styleUrl: 'app-settings.scss'
})
export class AppHome {

    @Element() el: HTMLElement;

    @State()
    private authUser: AuthUser;

    @State()
    private user: User;

    @State()
    private apiUser: ApiUser;

    @State()
    private valid: boolean = true;

    private validUsername: boolean = true;
    private validName: boolean = true;
    private validEmail: boolean = true;

    @State()
    private apiUsername: string;

    @State()
    private saving: boolean = false;

    private authService: AuthService;
    private userService: UserService;
    private apiUserService: ApiUserService;

    private navService: NavService;

    private errorService: ErrorService;

    private imageHistoryService: ImageHistoryService;

    private profilePicture: File;

    private storageService: StorageService;

    @State()
    private twitter: string = undefined;

    @State()
    private linkedin: string = undefined;

    @State()
    private dev: string = undefined;

    @State()
    private medium: string = undefined;

    @State()
    private github: string = undefined;

    @State()
    private custom: string = undefined;

    constructor() {
        this.authService = AuthService.getInstance();
        this.apiUserService = ApiUserFactoryService.getInstance();
        this.navService = NavService.getInstance();
        this.errorService = ErrorService.getInstance();
        this.imageHistoryService = ImageHistoryService.getInstance();
        this.userService = UserService.getInstance();
        this.storageService = StorageService.getInstance();
    }

    componentWillLoad() {
        this.authService.watch().pipe(
            filter((authUser: AuthUser) => authUser !== null && authUser !== undefined && !authUser.anonymous),
            take(1)).subscribe(async (authUser: AuthUser) => {
            this.authUser = authUser;
        });

        this.apiUserService.watch().pipe(
            filter((apiUser: ApiUser) => apiUser !== null && apiUser !== undefined && !apiUser.anonymous),
            take(1)).subscribe(async (apiUser: ApiUser) => {
            this.apiUser = apiUser;

            this.apiUsername = this.apiUser.username;
        });

        this.userService.watch().pipe(
            filter((user: User) => user !== null && user !== undefined && user.data && !user.data.anonymous),
            take(1)).subscribe(async (user: User) => {
            this.user = user;

            await this.initSocial();
        });
    }

    private initSocial(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this.user || !this.user.data || !this.user.data.social) {
                resolve();
                return;
            }

            this.twitter = this.user.data.social.twitter;
            this.linkedin = this.user.data.social.linkedin;
            this.dev = this.user.data.social.dev;
            this.medium = this.user.data.social.medium;
            this.github = this.user.data.social.github;
            this.custom = this.user.data.social.custom;
        })
    }

    private async signIn() {
        this.navService.navigate({
            url: '/signin' + (window && window.location ? window.location.pathname : ''),
            direction: NavDirection.FORWARD
        });
    }

    @Listen('keydown')
    async handleEnterKey($event: KeyboardEvent) {
        if ($event && $event.key === 'Enter') {
            await this.save();
        }
    }

    private async handleSubmit(e: Event) {
        e.preventDefault();

        await this.save();
    }

    private handleUsernameInput($event: CustomEvent<KeyboardEvent>) {
        this.apiUsername = ($event.target as InputTargetEvent).value;
    }

    private validateUsernameInput() {
        this.validUsername = this.apiUser && UserUtils.validUsername(this.apiUser.username);
        this.isValid();
    }

    private handleNameInput($event: CustomEvent<KeyboardEvent>) {
        this.user.data.name = ($event.target as InputTargetEvent).value;
    }

    private validateNameInput() {
        this.validName = this.user && this.user.data && UserUtils.validName(this.user.data.name);
        this.isValid();
    }

    private handleEmailInput($event: CustomEvent<KeyboardEvent>) {
        this.user.data.email = ($event.target as InputTargetEvent).value;
    }

    private validateEmailInput() {
        this.validEmail = this.user && this.user.data && UserUtils.validEmail(this.user.data.email);
        this.isValid();
    }

    private isValid() {
        this.valid = this.validUsername && this.validName && this.validEmail;
    }

    private toggleNewsletter($event: CustomEvent) {
        if (this.user && this.user.data) {
            this.user.data.newsletter = $event.detail.checked;
        }
    }

    private handleSocialInput($event: CustomEvent<KeyboardEvent>, key: string) {
        if (this.user && this.user.data) {
            if (!this.user.data.social) {
                this.user.data.social = {};
            }

            const value: string = ($event.target as InputTargetEvent).value;

            if (!value || value === '') {
                this.user.data.social[key] = null;
                this[key] = undefined;
            } else {
                this.user.data.social[key] = value;
                this[key] = value;
            }
        }
    }

    private handleSummaryInput($event: CustomEvent<KeyboardEvent>) {
        this.user.data.bio = ($event.target as InputTargetEvent).value;
    }

    private save(): Promise<void> {
        return new Promise<void>(async (resolve) => {
            if (!this.valid) {
                resolve();
                return;
            }

            try {
                this.saving = true;

                await this.uploadProfilePicture();
                await this.saveUser();
                await this.saveApiUser();

                this.saving = false;
            } catch (err) {
                this.errorService.error(err);
                this.saving = false;
            }

            resolve();
        });
    }

    private saveUser(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (!this.valid || !this.apiUser) {
                resolve();
                return;
            }

            try {
                await this.userService.update(this.user);

                resolve();
            } catch (err) {
                reject('Your changes couldn\'t be saved');
            }
        });
    }

    private saveApiUser(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (!this.valid || !this.apiUser) {
                resolve();
                return;
            }

            if (this.apiUsername === this.apiUser.username) {
                resolve();
                return;
            }

            this.apiUser.username = this.apiUsername;

            try {
                await this.apiUserService.put(this.apiUser, this.authUser.token, this.apiUser.id);

                resolve();
            } catch (err) {
                reject('Your username couldn\'t be saved');
            }
        });
    }

    private uploadProfilePicture(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (!this.valid || !this.user || !this.user.data) {
                resolve();
                return;
            }

            if (!this.profilePicture) {
                resolve();
                return;
            }

            try {
                const storageFile: StorageFile = await this.storageService.uploadImage(this.profilePicture, 'avatars', 524288);

                if (storageFile) {
                    this.user.data.photo_url = storageFile.downloadUrl;
                }

                resolve();
            } catch (err) {
                reject('Could not upload your profile picture!');
            }
        });
    }

    private async presentConfirmDelete() {
        const modal: HTMLIonModalElement = await IonControllerUtils.createModal({
            component: 'app-user-delete',
            componentProps: {
                username: this.apiUser.username
            }
        });

        modal.onDidDismiss().then(async (detail: OverlayEventDetail) => {
            if (detail && detail.data) {
                await this.deleteUser();
            }
        });

        await modal.present();
    }

    private deleteUser(): Promise<void> {
        return new Promise<void>(async (resolve) => {
            try {
                const loading: HTMLIonLoadingElement = await IonControllerUtils.createLoading({});

                await loading.present();

                const firebaseUser: firebase.User = firebase.auth().currentUser;

                if (firebaseUser) {
                    // We need the user token to access the API, therefore delete it here first
                    await this.apiUserService.delete(this.apiUser.id, this.authUser.token);

                    // Then delete the user
                    await this.userService.delete(this.authUser.uid);

                    // Decks and slides are delete with a cloud function triggered on auth.delete

                    await firebaseUser.delete();
                }

                await this.imageHistoryService.clear();

                this.navService.navigate({
                    url: '/',
                    direction: NavDirection.ROOT
                });

                await loading.dismiss();

                resolve();
            } catch (err) {
                this.errorService.error('Your user couldn\'t be deleted, contact us per email')
            }
        });
    }

    private selectProfilePicture(): Promise<void> {
        return new Promise<void>(async (resolve) => {
            const filePicker: HTMLInputElement = this.el.querySelector('input#inputProfilePicture');

            if (!filePicker) {
                resolve();
                return;
            }

            if (filePicker.files && filePicker.files.length > 0) {
                this.profilePicture = filePicker.files[0];
            }

            resolve();
        });
    }

    render() {
        return [
            <app-navigation></app-navigation>,
            <ion-content class="ion-padding fullscreen-padding">
                <main class="ion-padding">
                    {this.renderGuardedContent()}
                    {this.renderDangerZone()}
                </main>
            </ion-content>
        ];
    }

    private renderGuardedContent() {
        if (!this.authUser) {
            return this.renderNotLoggedInContent();
        } else {
            return this.renderUserContent();
        }
    }

    private renderNotLoggedInContent() {
        return [
            <h1>Oh, hi! Good to have you.</h1>,
            <p class="ion-padding-top">
                <ion-router-link onClick={() => this.signIn()}>Sign in</ion-router-link>
                to access your settings.</p>
        ]
    }

    private renderUserContent() {
        return [
            <h1>Settings</h1>,
                        <form onSubmit={(e: Event) => this.handleSubmit(e)}>
                            <ion-list class="inputs-list">
                                {this.renderName()}
                                {this.renderUsername()}
                                {this.renderEmail()}
                            </ion-list>

                            {this.renderUserAvatar()}

                            {this.renderSummary()}

                            {this.renderSocial()}

                            {this.renderSubmitForm()}
                        </form>,
            <p class="info">Note that your update has no effect on the presentations you would have already published.</p>
        ]
    }

    private renderName() {
        return [<ion-item class="item-title">
            <ion-label>Name</ion-label>
        </ion-item>,
            <ion-item>
                <ion-input value={this.user && this.user.data ? this.user.data.name : undefined} debounce={500} minlength={3} maxlength={64} required={true} input-mode="text" disabled={this.saving}
                           onIonInput={($event: CustomEvent<KeyboardEvent>) => this.handleNameInput($event)}
                           onIonChange={() => this.validateNameInput()}></ion-input>
            </ion-item>];
    }

    private renderEmail() {
        return [<ion-item class="item-title">
            <ion-label>Email</ion-label>
        </ion-item>,
            <ion-item>
                <ion-input value={this.user && this.user.data ? this.user.data.email : undefined} debounce={500} minlength={3} maxlength={254} required={true} input-mode="text" disabled={this.saving}
                           onIonInput={($event: CustomEvent<KeyboardEvent>) => this.handleEmailInput($event)}
                           onIonChange={() => this.validateEmailInput()}></ion-input>
            </ion-item>,
            <div class="newsletter">
                <ion-label>Send me newsletter emails</ion-label>
                <ion-checkbox slot="end" value="pepperoni" checked={this.user && this.user.data ? this.user.data.newsletter : false} disabled={this.saving} onIonChange={($event: CustomEvent) => this.toggleNewsletter($event)}></ion-checkbox>
            </div>];
    }

    private renderUsername() {
        return [<ion-item class="item-title">
            <ion-label>Username</ion-label>
        </ion-item>,
            <ion-item>
                <ion-input value={this.apiUsername} debounce={500} minlength={3} maxlength={32} required={true} disabled={this.saving}
                           input-mode="text"
                           onIonInput={($event: CustomEvent<KeyboardEvent>) => this.handleUsernameInput($event)}
                           onIonChange={() => this.validateUsernameInput()}></ion-input>
            </ion-item>];
    }

    private renderSubmitForm() {
        return <ion-button type="submit" class="ion-margin-top" disabled={!this.valid || this.saving || !this.apiUser || !this.user} color="primary" shape="round">
            <ion-label>Submit</ion-label>
        </ion-button>;
    }

    private renderDangerZone() {
        return [<h1 class="danger-zone">Danger Zone</h1>,
            <p>Once you delete your user, there is no going back. Please be certain.</p>,
            <ion-button color="danger" shape="round" fill="outline" onClick={() => this.presentConfirmDelete()} disabled={this.saving || !this.apiUser || !this.authUser}>
                <ion-label>Delete my user</ion-label>
            </ion-button>
        ];
    }

    private renderUserAvatar() {
        return <ion-list class="inputs-list">
            <ion-item class="item-title">
                <ion-label>Profile picture</ion-label>
            </ion-item>
            <div class="avatar">
                <app-avatar src={this.user && this.user.data ? this.user.data.photo_url : undefined} aria-label="Profile picture"></app-avatar>
                <input id="inputProfilePicture" type="file" accept="image/x-png,image/jpeg,image/gif" onChange={() => this.selectProfilePicture()} disabled={this.saving}/>
            </div>
            <p><small>Tips: if you would update your profile picture, ideally use a <strong>square</strong> image for that purpose</small></p>
        </ion-list>;
    }

    private renderSummary() {
        return <ion-list class="inputs-list">
            <ion-item class="item-title">
                <ion-label>Summary</ion-label>
            </ion-item>
            <ion-item>
                <ion-textarea rows={3} value={this.user && this.user.data ? this.user.data.bio : undefined} debounce={500} disabled={this.saving}
                              maxlength={192} placeholder="Your short biography or how do you introduce yourself"
                              onIonInput={(e: CustomEvent<KeyboardEvent>) => this.handleSummaryInput(e)}></ion-textarea>
            </ion-item>
        </ion-list>
    }

    private renderSocial() {
        return <ion-list class="inputs-list">
            {this.renderTwitter()}
            {this.renderLinkedIn()}
            {this.renderDev()}
            {this.renderMedium()}
            {this.renderGithub()}
            {this.renderCustom()}
        </ion-list>
    }

    private renderTwitter() {
        return [<ion-item class="item-title">
                <ion-label>Twitter</ion-label>
            </ion-item>,
            <p><small>https://twitter.com/<strong>{this.twitter ? this.twitter : 'yourusername'}</strong></small></p>,
            <ion-item>
                <ion-input value={this.user && this.user.data && this.user.data.social ? this.user.data.social.twitter : undefined} debounce={500} maxlength={128} input-mode="text" disabled={this.saving}
                           onIonInput={($event: CustomEvent<KeyboardEvent>) => this.handleSocialInput($event, 'twitter')}></ion-input>
            </ion-item>];
    }

    private renderLinkedIn() {
        return [<ion-item class="item-title">
            <ion-label>LinkedIn</ion-label>
        </ion-item>,
            <p><small>https://www.linkedin.com/in/<strong>{this.linkedin ? this.linkedin : 'yourusername'}</strong></small></p>,
            <ion-item>
                <ion-input value={this.user && this.user.data && this.user.data.social ? this.user.data.social.linkedin : undefined} debounce={500} maxlength={128} input-mode="text" disabled={this.saving}
                           onIonInput={($event: CustomEvent<KeyboardEvent>) => this.handleSocialInput($event, 'linkedin')}></ion-input>
            </ion-item>];
    }

    private renderDev() {
        return [<ion-item class="item-title">
            <ion-label>Dev.to</ion-label>
        </ion-item>,
            <p><small>https://dev.to/<strong>{this.dev ? this.dev : 'yourusername'}</strong></small></p>,
            <ion-item>
                <ion-input value={this.user && this.user.data && this.user.data.social ? this.user.data.social.dev : undefined} debounce={500} maxlength={128} input-mode="text" disabled={this.saving}
                           onIonInput={($event: CustomEvent<KeyboardEvent>) => this.handleSocialInput($event, 'dev')}></ion-input>
            </ion-item>];
    }

    private renderMedium() {
        return [<ion-item class="item-title">
            <ion-label>Medium</ion-label>
        </ion-item>,
            <p><small>https://medium.com/@<strong>{this.medium ? this.medium : 'yourusername'}</strong></small></p>,
            <ion-item>
                <ion-input value={this.user && this.user.data && this.user.data.social ? this.user.data.social.medium : undefined} debounce={500} maxlength={128} input-mode="text" disabled={this.saving}
                           onIonInput={($event: CustomEvent<KeyboardEvent>) => this.handleSocialInput($event, 'medium')}></ion-input>
            </ion-item>];
    }

    private renderGithub() {
        return [<ion-item class="item-title">
            <ion-label>GitHub</ion-label>
        </ion-item>,
            <p><small>https://github.com/<strong>{this.github ? this.github : 'yourusername'}</strong></small></p>,
            <ion-item>
                <ion-input value={this.user && this.user.data && this.user.data.social ? this.user.data.social.github : undefined} debounce={500} maxlength={128} input-mode="text" disabled={this.saving}
                           onIonInput={($event: CustomEvent<KeyboardEvent>) => this.handleSocialInput($event, 'github')}></ion-input>
            </ion-item>];
    }

    private renderCustom() {
        return [<ion-item class="item-title">
            <ion-label>Custom</ion-label>
        </ion-item>,
            <p><small>Your website or any custom url (for example: <strong>{this.custom ? this.custom : 'https://yourwebsite.com'}</strong>)</small></p>,
            <ion-item>
                <ion-input value={this.user && this.user.data && this.user.data.social ? this.user.data.social.custom : undefined} debounce={500} maxlength={128} input-mode="text" disabled={this.saving}
                           onIonInput={($event: CustomEvent<KeyboardEvent>) => this.handleSocialInput($event, 'custom')}></ion-input>
            </ion-item>];
    }
}
