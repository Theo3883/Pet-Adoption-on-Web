import { requireAuth } from '../utils/authUtils.js';
import Sidebar from '../SideBar/Sidebar.js';
import { showLoading, hideLoading } from '../utils/loadingUtils.js';

const API_URL = 'http://localhost:3000';
const token = localStorage.getItem('Token');

let user;
let userAnimals = [];

async function initialize() {
    // loading spinner
    const linkElement = document.createElement("link");
    linkElement.rel = "stylesheet";
    linkElement.href = "../utils/loadingUtils.css";
    document.head.appendChild(linkElement);

    user = requireAuth();
    if (!user) return; 
    
    // Render sidebar
    document.getElementById('sidebar-container').innerHTML = Sidebar.render('userAnimals');
    new Sidebar('userAnimals');
    
    await fetchUserAnimals();
}


async function fetchUserAnimals() {
    try {
        showLoading('Loading your animals...');
        
        const response = await fetch(`${API_URL}/animals/all`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
        if (!response.ok) {
            throw new Error('Failed to fetch animals');
        }
        const allAnimals = await response.json();
        
        // Filter to only show animals belonging to the current user
        userAnimals = allAnimals.filter(animal => animal.USERID === user.id);
        
        displayUserAnimals(userAnimals);
    } catch (error) {
        console.error('Error fetching user animals:', error);
        document.getElementById('my-animals-container').innerHTML = 
            '<div class="error-message">Failed to load your animals. Please try again later.</div>';
    } finally {
        hideLoading();
    }
}

// user's animals
function displayUserAnimals(animals) {
    const container = document.getElementById('my-animals-container');
    container.innerHTML = '';

    if (animals.length === 0) {
        container.innerHTML = `
            <div class="no-animals">
                <h3>You don't have any animals yet</h3>
                <p>Your published animals will appear here.</p>
                <a href="../Publish/Publish.html" class="btn">Publish Animal</a>
            </div>
        `;
        return;
    }

    animals.forEach((animal) => {
        const card = document.createElement('div');
        card.className = 'card';
        
        // Check for piped media URL 
        let imageSource = 'https://via.placeholder.com/300x200?text=No+Image';
        
        if (animal.multimedia && animal.multimedia.length > 0) {
            const media = animal.multimedia[0];
            if (media.pipeUrl) {
                // Use the media pipe URL
                imageSource = `${API_URL}${media.pipeUrl}`;
            } else if (media.fileData && media.mimeType) {
                // Fallback to base64 if available
                imageSource = `data:${media.mimeType};base64,${media.fileData}`;
            } else if (media.URL) {
                // Last resort: direct URL
                imageSource = media.URL;
            }
        }
        
        card.innerHTML = `
            <img src="${imageSource}" alt="${animal.NAME}">
            <div class="card-content">
                <h2>${animal.NAME}</h2>
                <p>Breed: ${animal.BREED}</p>
                <p>Species: ${animal.SPECIES}</p>
                <p>Age: ${animal.AGE}</p>
                <p>Gender: ${animal.GENDER === 'male' ? 'Male' : 'Female'}</p>
                <button class="delete-btn" data-animal-id="${animal.ANIMALID}">Delete Animal</button>
            </div>
        `;

        container.appendChild(card);
    });

    
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', handleDeleteAnimal);
    });
}

//  animal deletion
async function handleDeleteAnimal(event) {
    const animalId = event.target.dataset.animalId;
    
    if (!confirm('Are you sure you want to delete this animal?')) {
        return;
    }
    
    try {
        showLoading('Deleting animal...');
        
        const response = await fetch(`${API_URL}/animals/delete`, {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
             },
            body: JSON.stringify({ animalId: parseInt(animalId) })
        });

        if (response.ok) {
            userAnimals = userAnimals.filter(animal => animal.ANIMALID !== parseInt(animalId));
            displayUserAnimals(userAnimals);
            alert('Animal deleted successfully');
        } else {
            const error = await response.json();
            alert(`Error: ${error.error || 'Failed to delete animal'}`);
        }
    } catch (error) {
        console.error('Error deleting animal:', error);
        alert('An error occurred while deleting the animal');
    } finally {
        hideLoading();
    }
}

initialize();