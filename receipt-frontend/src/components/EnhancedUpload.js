import React, { useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import LoadingSpinner from './LoadingSpinner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_GATEWAY_URL;

const EnhancedUpload = ({ onUploadComplete, onUploadError }) => {
    const { session } = useAuth();
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadStage, setUploadStage] = useState('uploading');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [dragActive, setDragActive] = useState(false);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState('');

    // File validation
    const validateFile = (file) => {
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

        if (file.size > maxSize) {
            throw new Error('File size must be less than 10MB');
        }

        if (!allowedTypes.includes(file.type)) {
            throw new Error('Please select a valid image file (JPEG, PNG, GIF)');
        }
    };

    // Handle file selection
    const handleFileSelect = useCallback((selectedFile) => {
        try {
            validateFile(selectedFile);
            setFile(selectedFile);
            setError('');

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => setPreview(e.target.result);
            reader.readAsDataURL(selectedFile);
        } catch (err) {
            setError(err.message);
        }
    }, []);

    // Drag and drop handlers
    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    }, [handleFileSelect]);

    // File input change
    const handleInputChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    };

    // Simulate upload progress stages
    const simulateProgress = async () => {
        const stages = [
            { stage: 'uploading', duration: 2000, progress: 25 },
            { stage: 'processing', duration: 3000, progress: 50 },
            { stage: 'extracting', duration: 4000, progress: 75 },
            { stage: 'parsing', duration: 2000, progress: 90 },
            { stage: 'saving', duration: 1000, progress: 100 }
        ];

        for (const stageInfo of stages) {
            setUploadStage(stageInfo.stage);
            
            const startTime = Date.now();
            const targetProgress = stageInfo.progress;
            const currentProgress = uploadProgress;
            
            while (Date.now() - startTime < stageInfo.duration) {
                const elapsed = Date.now() - startTime;
                const progress = currentProgress + 
                    (targetProgress - currentProgress) * (elapsed / stageInfo.duration);
                setUploadProgress(Math.min(progress, targetProgress));
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            setUploadProgress(targetProgress);
        }
    };

    // Handle upload
    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        setUploadProgress(0);
        setError('');

        try {
            // Start progress simulation
            const progressPromise = simulateProgress();

            // Actual upload
            const reader = new FileReader();
            reader.onloadend = async () => {
                try {
                    const base64data = reader.result;
                    const response = await axios.post(
                        `${API_URL}/upload`,
                        { image: base64data },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session.access_token}`
                            },
                            timeout: 60000
                        }
                    );

                    // Wait for progress simulation to complete
                    await progressPromise;
                    
                    setUploadStage('complete');
                    setUploadProgress(100);
                    
                    // Reset after success
                    setTimeout(() => {
                        setFile(null);
                        setPreview(null);
                        setUploading(false);
                        setUploadProgress(0);
                        setUploadStage('uploading');
                        
                        if (onUploadComplete) {
                            onUploadComplete(response.data);
                        }
                    }, 1500);

                } catch (err) {
                    console.error('Upload error:', err);
                    const errorMessage = err.response?.data?.message || 'Upload failed';
                    setError(errorMessage);
                    setUploading(false);
                    
                    if (onUploadError) {
                        onUploadError(errorMessage);
                    }
                }
            };
            reader.readAsDataURL(file);

        } catch (err) {
            setError('Failed to read file');
            setUploading(false);
        }
    };

    // Clear file
    const clearFile = () => {
        setFile(null);
        setPreview(null);
        setError('');
    };

    // Calculate estimated time based on file size
    const getEstimatedTime = () => {
        if (!file) return null;
        const sizeInMB = file.size / (1024 * 1024);
        const estimatedSeconds = Math.max(10, Math.round(sizeInMB * 3));
        return `${estimatedSeconds} seconds`;
    };

    if (uploading) {
        return (
            <LoadingSpinner
                stage={uploadStage}
                progress={uploadProgress}
                fileName={file?.name}
                estimatedTime={getEstimatedTime()}
                size="large"
            />
        );
    }

    return (
        <div className="enhanced-upload">
            {!file ? (
                <div
                    className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('file-input').click()}
                >
                    <div className="upload-icon">📤</div>
                    <div className="upload-text">
                        Drag & drop your receipt here, or click to browse
                    </div>
                    <div className="upload-subtext">
                        Supports JPEG, PNG, GIF up to 10MB
                    </div>
                    <input
                        id="file-input"
                        type="file"
                        accept="image/*"
                        onChange={handleInputChange}
                        style={{ display: 'none' }}
                    />
                </div>
            ) : (
                <div className="file-preview">
                    {preview && (
                        <img 
                            src={preview} 
                            alt="Receipt preview" 
                            className="preview-image"
                        />
                    )}
                    <div className="file-details">
                        <strong>{file.name}</strong>
                        <br />
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    
                    <div className="upload-actions">
                        <button 
                            className="btn-upload" 
                            onClick={handleUpload}
                            disabled={uploading}
                        >
                            📤 Upload & Process
                        </button>
                        <button 
                            className="btn-cancel" 
                            onClick={clearFile}
                        >
                            ✕ Remove
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <div className="upload-error">
                    ⚠️ {error}
                </div>
            )}
        </div>
    );
};

export default EnhancedUpload;
