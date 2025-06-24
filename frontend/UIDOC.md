

# **The Definitive Guide to Building Secure SPAs with Svelte 5, Vite, Melt UI, and oauth2-proxy**

## **Part II: Mastering Svelte 5 Reactivity and State Management**

This section transitions from project setup to the application's core logic. It focuses on Svelte 5's new reactivity model, Runes, and explores how to architect robust state management solutions in the absence of a framework's built-in tools.

### **Section 2.1: The Runes Paradigm \- A New Era of Reactivity**

Svelte 5 introduces a fundamental shift in its reactivity system with the introduction of "Runes." Previously, Svelte's reactivity was largely implicit, derived by the compiler from let declarations and $: labels. Runes make reactivity explicit, using special functions (prefixed with $) that act as compiler signals.1 This approach enhances clarity and predictability, especially in complex components and for state shared across modules.

* **$state**: This is the cornerstone of the new system. It declares a piece of reactive state. When the value of a $state variable changes, any part of the UI that depends on it will automatically update. For objects and arrays, $state creates a deep reactive proxy, allowing Svelte to track changes to nested properties or array elements with fine-grained precision.14  
  HTML  
  \<script\>  
    let count \= $state(0);  
    let user \= $state({ name: 'Alex', loggedIn: false });

    function increment() {  
      count++; // Direct mutation triggers update  
    }

    function login() {  
      user.loggedIn \= true; // Mutating a property of the proxy triggers update  
    }  
  \</script\>

* **$derived**: This rune is used to create values that are computed from other reactive state. It is the explicit replacement for the $: reactive declaration syntax for derived values. The derived value automatically recalculates whenever its dependencies change.1  
  HTML  
  \<script\>  
    let count \= $state(0);  
    let doubled \= $derived(count \* 2);  
  \</script\>

  \<p\>{count} doubled is {doubled}\</p\> \`\`\`

* **$effect**: This rune is the designated tool for running side effects in response to state changes. An $effect runs once when the component mounts and then re-runs whenever any of its tracked dependencies (reactive variables used inside it) change. It is ideal for tasks like logging, manual DOM manipulation, or fetching data in response to a state update.1  
  HTML  
  \<script\>  
    let userId \= $state(1);

    $effect(() \=\> {  
      console.log(\`User ID changed to: ${userId}\`);  
      // You could fetch user data here:  
      // fetch(\`/api/users/${userId}\`);  
    });  
  \</script\>

* **$props**: In Svelte 5, component properties (props) are handled explicitly with the $props rune. This makes the component's public API clearer and allows for easy destructuring and default values.1  
  HTML  
  \<script\>  
    // In a child component  
    let { name \= 'Guest', size \= 'md' } \= $props();  
  \</script\>

This explicit, signal-based model forces a more deliberate approach to state management. A developer must consciously decide what is and isn't state by using $state, which prevents accidental reactivity and leads to a more robust and understandable application architecture.

### **Section 2.2: Architecting Global State without SvelteKit**

In a plain Vite setup, there is no built-in "app store" or load function mechanism for managing data that needs to be accessible across the entire application. Global state must be explicitly designed and implemented. Svelte 5's ability to use runes within standard .js and .ts files is the key feature that enables clean, framework-agnostic global state management.2  
Pattern 1: The Reactive Service Module (Recommended)  
This pattern leverages Svelte 5's module-level reactivity to create simple, effective, and easily testable state stores. It involves creating a .svelte.js or .svelte.ts file that exports a reactive object.  
The key architectural principle here is a direct consequence of how the Svelte compiler handles runes: you can mutate the *properties* of an exported $state object from other modules, but you must **never reassign the exported variable itself**.2 Reassignment would break the reactive connection across module boundaries.  
Here is an example of a global service for managing user state, located at src/lib/services/user.service.svelte.ts:

TypeScript

// src/lib/services/user.service.svelte.ts  
export interface UserProfile {  
  id: string;  
  name: string;  
  email: string;  
}

interface UserState {  
  profile: UserProfile | null;  
  isAuthenticated: boolean;  
}

// Create the reactive state object.  
// This object will be a singleton across the entire application.  
const state: UserState \= $state({  
  profile: null,  
  isAuthenticated: false,  
});

// Expose methods to manipulate the state, enforcing business logic.  
export const userService \= {  
  // Provide read-only access to the state via getters  
  get profile() { return state.profile; },  
  get isAuthenticated() { return state.isAuthenticated; },

  // Define mutations that operate on the state object's properties  
  login(userProfile: UserProfile) {  
    state.profile \= userProfile;  
    state.isAuthenticated \= true;  
  },

  logout() {  
    state.profile \= null;  
    state.isAuthenticated \= false;  
  }  
};

This service can then be imported and used in any Svelte component. The UI will react automatically to calls to userService.login() or userService.logout().

HTML

\<script lang="ts"\>  
  import { userService } from '$lib/services/user.service.svelte';  
\</script\>

{\#if userService.isAuthenticated}  
  \<p\>Welcome, {userService.profile?.name}\</p\>  
{:else}  
  \<p\>Please log in.\</p\>  
{/if}

This pattern is powerful because it creates a clear, reactive source of truth that is decoupled from any specific UI component, guiding the developer towards a more maintainable state architecture.  
Pattern 2: The Class-Based Service  
For more complex state with intricate logic, a class-based approach can provide additional structure. Svelte 5 allows $state to be used directly on class fields.14

TypeScript

// src/lib/services/notification.service.svelte.ts  
import { nanoid } from 'nanoid';

export interface ToastMessage {  
  id: string;  
  type: 'success' | 'error' | 'info';  
  text: string;  
}

class NotificationService {  
  messages: ToastMessage \= $state();

  addToast(text: string, type: 'success' | 'error' | 'info' \= 'info') {  
    const id \= nanoid();  
    this.messages.push({ id, text, type });  
    setTimeout(() \=\> this.removeToast(id), 5000);  
  }

  removeToast(id: string) {  
    const index \= this.messages.findIndex(m \=\> m.id \=== id);  
    if (index \> \-1) {  
      this.messages.splice(index, 1);  
    }  
  }  
}

// Instantiate the class once to create a singleton instance  
export const notificationService \= new NotificationService();

This pattern is particularly useful when the state logic is substantial, as it encapsulates both the data (messages) and the methods for manipulating it within a single, cohesive unit.  
Persistent State  
For state that needs to survive a page refresh, such as user preferences or session information, it must be persisted to a browser storage mechanism like localStorage or sessionStorage. While this can be implemented manually using an $effect to read from and write to storage, several libraries simplify this process. For a runes-native solution, @friendofsvelte/state is a lightweight option that provides a PersistentState class, abstracting away the boilerplate of serialization and storage event listening.17

## **Part III: Building a Design System with Melt UI and Tailwind CSS**

This part covers the practical implementation of the user interface. It demonstrates how to leverage the headless philosophy of Melt UI, combined with the utility-first power of Tailwind CSS, to build fully custom, accessible, and functional components.

### **Section 3.1: The Headless Philosophy and the Builder Pattern**

Understanding the core concepts of Melt UI is essential for using it effectively. Unlike traditional component libraries that provide pre-styled components (e.g., \<Button\>), Melt UI provides "builders".5

* **What is "Headless UI"?** A headless UI library provides all the complex logic, state management, and accessibility attributes for a component but provides **zero** visual styling.4 This approach gives the developer complete control over the markup and appearance, ensuring the final components perfectly match the application's design system.  
* **The Builder Function:** The central concept in Melt UI is the "builder function," such as createDialog or createSelect. This is a JavaScript function that you call within your component's \<script\> tag. It doesn't render any HTML itself; instead, it returns an object containing all the necessary pieces to construct the component manually.5  
* **The use:melt Directive:** The primary mechanism for applying the logic from a builder to your own HTML elements is the use:melt Svelte action. This directive takes a builder element (which is a Svelte store) and applies the necessary attributes (aria-\*, role, data-\*), event listeners, and other properties to the element.12 Melt UI also offers an optional preprocessor that can transform this directive into the more verbose but equivalent  
  {...$builder} use:$builder.action syntax, which can be helpful for understanding the underlying mechanics.18  
* **Anatomy of a Builder Return Object:** When you call a builder function, it typically returns an object with a consistent structure 12:  
  * **elements**: An object containing builder stores for each semantic part of the component (e.g., trigger, content, overlay).  
  * **states**: An object containing reactive Svelte stores that represent the component's state (e.g., open, selected).  
  * **options**: An object containing stores for the component's configurable options (e.g., disabled).  
  * **helpers**: An object containing utility functions for interacting with the component (e.g., addToast).

This builder pattern enforces a healthy separation of concerns. It encourages the developer to think about the semantic HTML structure first and then "enhance" that markup with the behavior and accessibility provided by Melt UI, leading to more robust and maintainable code.

### **Section 3.2: Practical Implementation: Core UI Components**

The following examples demonstrate how to build common UI components from scratch using Melt UI builders and Tailwind CSS for styling. Each example is a complete, self-contained Svelte component.  
Interactive Modals with the Dialog Builder  
The Dialog builder is used for creating modal windows, pop-ups, and drawers. It manages focus, handles escape key closing, and prevents background scrolling.20

HTML

\<script lang="ts"\>  
  import { createDialog, melt } from '@melt-ui/svelte';  
  import { slide } from 'svelte/transition';

  const {  
    elements: { trigger, overlay, content, title, description, close, portalled },  
    states: { open }  
  } \= createDialog({  
    // Disable closing when clicking outside the dialog for confirmation modals  
    closeOnOutsideClick: false  
  });

  let { onConfirm \= () \=\> {} } \= $props();

  function handleConfirm() {  
    onConfirm();  
    $open \= false;  
  }  
\</script\>

\<button use:melt={$trigger} class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"\>  
  Open Dialog  
\</button\>

{\#if $open}  
  \<div use:melt={$portalled}\>  
    \<div use:melt={$overlay} class="fixed inset-0 z-40 bg-black/50" transition:slide /\>

    \<div  
      use:melt={$content}  
      class="fixed left-1/2 top-1/2 z-50 \-translate-x-1/2 \-translate-y-1/2 w-\[90vw\] max-w-md rounded-lg bg-white p-6 shadow-lg"  
      transition:slide={{ duration: 200 }}  
    \>  
      \<h2 use:melt={$title} class="text-lg font-semibold text-gray-900"\>  
        Confirm Action  
      \</h2\>  
      \<p use:melt={$description} class="mt-2 text-sm text-gray-600"\>  
        Are you sure you want to proceed? This action cannot be undone.  
      \</p\>  
      \<div class="mt-6 flex justify-end space-x-2"\>  
        \<button use:melt={$close} class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"\>  
          Cancel  
        \</button\>  
        \<button on:click={handleConfirm} class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"\>  
          Confirm  
        \</button\>  
      \</div\>  
    \</div\>  
  \</div\>  
{/if}

Complex Forms with Select, RadioGroup, and Input Builders  
Melt UI provides builders for a wide range of form controls.

* **Select (createSelect)**: For building custom dropdown menus.21  
  HTML  
  \<script lang="ts"\>  
    import { createSelect, melt } from '@melt-ui/svelte';  
    import { slide } from 'svelte/transition';

    const flavors \=;

    const {  
      elements: { trigger, menu, option, label },  
      states: { open, selectedLabel }  
    } \= createSelect({  
      // Set a default selected item  
      defaultSelected: flavors  
    });  
  \</script\>

  \<label use:melt={$label} class="block text-sm font-medium text-gray-700"\>Favorite Flavor\</label\>  
  \<button use:melt={$trigger} aria-label="Food" class="mt-1 flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"\>  
    {$selectedLabel |

| 'Select a flavor...'}  
▼

{\#if $open}  
  \<div use:melt={$menu} class="z-10 mt-1 w-full rounded-md bg-white shadow-lg" transition:slide\>  
    {\#each flavors as flavor}  
      \<div use:melt={$option(flavor)} class="cursor-pointer p-2 hover:bg-gray-100 data-\[highlighted\]:bg-blue-100"\>  
        {flavor.label}  
      \</div\>  
    {/each}  
  \</div\>  
{/if}  
\`\`\`

* **Radio Group (createRadioGroup)**: For single-choice selections where all options are visible.22  
  HTML  
  \<script lang="ts"\>  
    import { createRadioGroup, melt } from '@melt-ui/svelte';

    const {  
      elements: { root, item },  
      helpers: { isChecked }  
    } \= createRadioGroup({  
      defaultValue: 'free'  
    });  
  \</script\>

  \<div use:melt={$root} aria-labelledby="plan-label" class="space-y-2"\>  
    \<span id="plan-label" class="text-sm font-medium"\>Choose a Plan\</span\>  
    {\#each \['free', 'pro', 'enterprise'\] as plan}  
      \<div class="flex items-center space-x-2"\>  
        \<button use:melt={$item(plan)} class="h-4 w-4 rounded-full border border-gray-400 flex items-center justify-center"\>  
          {\#if $isChecked(plan)}  
            \<div class="h-2 w-2 rounded-full bg-blue-600"\>\</div\>  
          {/if}  
        \</button\>  
        \<label for={plan} class="capitalize"\>{plan}\</label\>  
      \</div\>  
    {/each}  
  \</div\>

* **Standard Inputs with Labels (createLabel)**: For basic text inputs, use the standard \<input\> element and enhance its accessibility with createLabel.23  
  HTML  
  \<script lang="ts"\>  
    import { createLabel, melt } from '@melt-ui/svelte';  
    const { elements: { root } } \= createLabel();  
  \</script\>

  \<div\>  
    \<label use:melt={$root} for="email" class="block text-sm font-medium text-gray-700"\>Email\</label\>  
    \<input type="email" id="email" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /\>  
  \</div\>

Global Notifications with the Toast Builder  
The Toast builder is unique in that it's designed to be used globally rather than as a discrete component. This architecture perfectly models the real-world behavior of notification systems and is an excellent opportunity to combine the global state patterns from Part II with Melt UI.24  
First, create a global notification service using the class-based pattern:

TypeScript

// src/lib/services/toast.service.svelte.ts  
import { createToaster, melt } from '@melt-ui/svelte';  
import type { ToastData as MeltToastData, ToastProps } from '@melt-ui/svelte/builders/toast';

export type ToastData \= {  
  title: string;  
  description: string;  
  type: 'success' | 'error' | 'info';  
};

// createToaster returns the global state and helpers for our toasts  
const {  
  elements,  
  helpers,  
  states,  
  actions  
} \= createToaster\<ToastData\>({  
  closeDelay: 5000,  
  // Pause the close timer when hovering over any toast  
  hover: 'pause-all'  
});

class ToastService {  
  // Expose the necessary parts from createToaster  
  get elements() { return elements; }  
  get states() { return states; }  
  get actions() { return actions; }

  // Public methods to interact with the toast system  
  addToast(data: ToastData, props?: ToastProps\<ToastData\>) {  
    helpers.addToast({ data,...props });  
  }

  success(title: string, description: string) {  
    this.addToast({ title, description, type: 'success' });  
  }

  error(title: string, description: string) {  
    this.addToast({ title, description, type: 'error' });  
  }  
}

export const toastService \= new ToastService();

Next, create a Toaster.svelte component that subscribes to this service and renders the toasts:

HTML

\<script lang="ts"\>  
  import { toastService, type ToastData } from '$lib/services/toast.service.svelte';  
  import { melt } from '@melt-ui/svelte';  
  import { fly } from 'svelte/transition';

  const { elements, states, actions } \= toastService;  
  const { content, title, description, close } \= elements;  
  const { toasts } \= states;  
  const { portal } \= actions;

  const typeClasses: Record\<ToastData\['type'\], string\> \= {  
    success: 'bg-green-100 border-green-500 text-green-800',  
    error: 'bg-red-100 border-red-500 text-red-800',  
    info: 'bg-blue-100 border-blue-500 text-blue-800'  
  };  
\</script\>

\<div use:portal class="fixed top-0 right-0 z- p-4 space-y-2"\>  
  {\#each $toasts as { id, data } (id)}  
    \<div  
      use:melt={$content(id)}  
      class="w-80 rounded-md border p-4 shadow-lg {typeClasses\[data.type\]}"  
      transition:fly={{ x: 300, duration: 300 }}  
    \>  
      \<div class="flex items-start"\>  
        \<div class="flex-1"\>  
          \<h3 use:melt={$title(id)} class="font-semibold"\>{data.title}\</h3\>  
          \<p use:melt={$description(id)} class="text-sm"\>{data.description}\</p\>  
        \</div\>  
        \<button use:melt={$close(id)} class="ml-4 text-lg font-bold"\>×\</button\>  
      \</div\>  
    \</div\>  
  {/each}  
\</div\>

Finally, add \<Toaster /\> to your root App.svelte file. Now, you can trigger notifications from any component in your application with a simple function call:

HTML

\<script lang="ts"\>  
  import { toastService } from '$lib/services/toast.service.svelte';  
\</script\>

\<button on:click={() \=\> toastService.success('Profile Saved', 'Your changes have been saved successfully.')}\>  
  Save Profile  
\</button\>

### **Section 3.3: The Melt UI Builder Quick Reference Table**

The Melt UI library is extensive. This table serves as a high-level map to the most common builders, summarizing their purpose and the essential parts they return. It helps accelerate development by highlighting the consistent patterns across the library, allowing a developer to quickly find the right tool for the job.

| Builder Function | Purpose | Key elements Returned | Key states Returned |
| :---- | :---- | :---- | :---- |
| createDialog() | For modal dialogs and pop-ups.20 | trigger, overlay, content, title, close | open |
| createSelect() | For dropdown select inputs.21 | trigger, menu, option, hiddenInput | selected, open |
| createDropdownMenu() | For action menus and navigation.26 | trigger, menu, item, separator | open |
| createToaster() | For global, non-intrusive notifications.24 | content, title, description, close | toasts (readable store) |
| createRadioGroup() | For selecting a single option from a set.22 | root, item, hiddenInput | value, isChecked |
| createAccordion() | For collapsible content sections.19 | root, item, trigger, content | value |
| createToolbar() | For grouping controls like buttons.27 | root, button, link, separator | N/A |

## **Part IV: Securing the SPA with oauth2-proxy**

This final part integrates the secure authentication layer, a critical component for any real-world application. We will use oauth2-proxy to implement the Backend for Frontend (BFF) pattern, which provides a robust security posture by keeping tokens out of the browser.

### **Section 4.1: The Secure Proxy Authentication Flow (BFF Pattern)**

A primary security concern for SPAs is the storage of authentication tokens (JWTs). Storing them in localStorage makes them vulnerable to XSS attacks, while standard browser cookies are susceptible to CSRF attacks. The oauth2-proxy model mitigates these risks by handling all token interactions on the server side.6  
The architecture works as follows 6:

1. **Initiate Login:** The SPA, when it needs to authenticate a user, performs a full-page redirect to a special endpoint on the proxy, such as /oauth2/start.  
2. **OAuth2 Handshake:** The proxy takes over and performs the complete OAuth2 Authorization Code flow with the configured Identity Provider (e.g., Auth0, Google, Okta). The user authenticates directly with the provider.  
3. **Token Reception:** The Identity Provider redirects back to the proxy's callback URL with an authorization code. The proxy exchanges this code for an access token and, optionally, a refresh token.  
4. **Secure Session Cookie:** Instead of sending the tokens to the browser, the proxy stores them securely (e.g., in memory, Redis, or an encrypted cookie store). It then sets a secure, HttpOnly, SameSite=Strict cookie in the user's browser. This cookie contains an opaque session identifier, not the JWT itself.  
5. **Authenticated API Calls:** The Svelte application makes all subsequent API calls to endpoints exposed by the proxy (e.g., /api/data). The browser automatically includes the HttpOnly cookie with each request.  
6. **Request Proxying:** For each incoming request, the proxy validates the session cookie, retrieves the corresponding access token from its server-side store, and attaches it as an Authorization: Bearer header to the request. It then forwards (proxies) this request to the actual backend API service.

This model fundamentally shifts security responsibility from the frontend to the backend/infrastructure. The Svelte application code becomes dramatically simpler and more secure by default because it **never sees, handles, or stores any tokens**.

### **Section 4.2: Implementing the Authentication Service**

To integrate this flow into the Svelte app, we create a global authentication service. This service will be the single source of truth for the user's authentication status within the UI. Its state is determined simply by whether an API call to the proxy's user information endpoint succeeds or fails.

TypeScript

// src/lib/services/auth.service.svelte.ts  
import type { UserProfile } from '$lib/services/user.service.svelte';

interface AuthState {  
  user: UserProfile | null;  
  isLoading: boolean;  
}

const state: AuthState \= $state({  
  user: null,  
  isLoading: true, // Start in a loading state  
});

// The user info endpoint provided by oauth2-proxy  
const USER\_INFO\_URL \= '/oauth2/userinfo';

export const authService \= {  
  get user() { return state.user; },  
  get isLoading() { return state.isLoading; },  
  get isAuthenticated() { return\!\!state.user; },

  /\*\*  
   \* Checks the user's session by calling the proxy's userinfo endpoint.  
   \* This is the primary method for determining if the user is logged in.  
   \*/  
  async fetchUser() {  
    state.isLoading \= true;  
    try {  
      const response \= await fetch(USER\_INFO\_URL);  
      if (\!response.ok) {  
        // A 401 or other error means no valid session  
        throw new Error('Not authenticated');  
      }  
      const userData \= await response.json();  
      state.user \= {  
        id: userData.sub, // 'sub' is a standard OIDC claim for user ID  
        email: userData.email,  
        name: userData.name |  
| userData.email,  
      };  
    } catch (error) {  
      state.user \= null;  
    } finally {  
      state.isLoading \= false;  
    }  
  },

  /\*\*  
   \* Initiates the login flow by redirecting to the proxy's start URL.  
   \* The proxy will handle the redirect back to the application.  
   \*/  
  login() {  
    // Redirect to where the user was, or to the dashboard  
    const redirectUrl \= window.location.pathname \+ window.location.search;  
    window.location.href \= \`/oauth2/start?rd=${encodeURIComponent(redirectUrl)}\`;  
  },

  /\*\*  
   \* Ends the session by redirecting to the proxy's sign\_out URL.  
   \*/  
  logout() {  
    const logoutRedirect \= \`${window.location.origin}/logged-out\`;  
    window.location.href \= \`/oauth2/sign\_out?rd=${encodeURIComponent(logoutRedirect)}\`;  
  }  
};

### **Section 4.3: Creating Protected Views and API Clients**

With the authentication service in place, we can now structure the application to respond to the user's authentication state.  
Application Entry Point (App.svelte)  
The root component is responsible for initializing the authentication check when the application first loads. An $effect with no dependencies is perfect for this, as it runs only once on mount.

HTML

\<script lang="ts"\>  
  import { authService } from '$lib/services/auth.service.svelte';  
  import Dashboard from '$lib/pages/Dashboard.svelte';  
  import LoginPage from '$lib/pages/LoginPage.svelte';  
  import Spinner from '$lib/components/Spinner.svelte';  
  import Toaster from '$lib/components/Toaster.svelte';

  // Trigger the initial authentication check when the app loads  
  $effect(() \=\> {  
    authService.fetchUser();  
  });  
\</script\>

\<Toaster /\>

\<main class="container mx-auto p-4"\>  
  {\#if authService.isLoading}  
    \<Spinner /\>  
  {:else if authService.isAuthenticated}  
    \<Dashboard /\>  
  {:else}  
    \<LoginPage /\>  
  {/if}  
\</main\>

Protected Content and Login Page  
The LoginPage.svelte component simply presents a login button that calls authService.login(). The Dashboard.svelte component can now assume a user is authenticated and can display user-specific information and a logout button.

HTML

\<script lang="ts"\>  
  import { authService } from '$lib/services/auth.service.svelte';  
\</script\>

\<div class="flex justify-between items-center"\>  
  \<h1 class="text-2xl font-bold"\>Dashboard\</h1\>  
  \<div\>  
    \<span\>Welcome, {authService.user?.name}\</span\>  
    \<button on:click={authService.logout} class="ml-4 px-3 py-1 bg-gray-200 rounded"\>Logout\</button\>  
  \</div\>  
\</div\>

API Client  
To fetch data from protected backend APIs, create a simple wrapper around the fetch API. This ensures all requests are sent to the proxy, which will then handle attaching the Authorization header.

TypeScript

// src/lib/api.ts  
const API\_PREFIX \= '/api'; // Assuming oauth2-proxy is configured to proxy requests starting with /api

async function apiFetch\<T\>(endpoint: string, options?: RequestInit): Promise\<T\> {  
  const response \= await fetch(\`${API\_PREFIX}${endpoint}\`, options);

  if (response.status \=== 401\) {  
    // The session is invalid or expired, trigger a re-login  
    authService.login();  
    // Throw an error to stop the current execution flow  
    throw new Error('Session expired');  
  }

  if (\!response.ok) {  
    throw new Error(\`API request failed with status ${response.status}\`);  
  }

  return response.json();  
}

// Example usage:  
// const data \= await apiFetch\<{ id: string, value: string }\>('/items');

This completes the integration, resulting in a highly secure SPA where the frontend code is cleanly separated from the complexities of token management.

## **Part V: Conclusion and Further Exploration**

### **Summary of the Architecture**

This guide has detailed the construction of a modern, secure Single Page Application by combining four powerful technologies. The resulting architecture leverages the unique strengths of each component to create a system that is performant, secure, and offers an excellent developer experience.

* **Vite** provides the fast and lean build foundation, enabling rapid development cycles.  
* **Svelte 5 and Runes** offer an explicit and predictable reactivity model, leading to clean and maintainable state management, both within components and globally via reactive service modules.  
* **Melt UI's** headless builder pattern grants complete control over the application's design and ensures top-tier accessibility without sacrificing developer productivity.  
* **oauth2-proxy** implements the robust Backend for Frontend (BFF) security pattern, abstracting away the complexities of OAuth2 token management and protecting the application from common browser-based vulnerabilities.

The decision to build without SvelteKit demonstrates that while frameworks provide valuable conventions and integrations, it is entirely feasible to construct a feature-complete, production-grade application by manually composing best-in-class tools. This approach offers maximum control and a deeper understanding of the underlying mechanics of a modern web stack.

### **Deployment Considerations**

The deployment model for this architecture consists of two distinct parts:

1. **The Svelte SPA:** The npm run build command, executed by Vite, produces a dist/ directory containing highly optimized, static HTML, CSS, and JavaScript files. These files can be deployed to any static hosting provider, such as Vercel, Netlify, AWS S3 with CloudFront, or a simple Nginx server.  
2. **The oauth2-proxy Service:** The proxy is a stateful service that must be deployed separately. It needs to be configured with the appropriate client ID, secret, and other details for your chosen Identity Provider. It should be placed network-wise between the user and your backend APIs, acting as a gateway. A common setup involves running the proxy in a Docker container and using an ingress controller or load balancer to route traffic appropriately (e.g., requests to /oauth2/\* go to the proxy, requests for static assets go to the SPA's host, and requests to /api/\* are routed through the proxy to the backend).

1. 